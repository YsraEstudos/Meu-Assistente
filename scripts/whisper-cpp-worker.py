#!/usr/bin/env python3
"""Persistent NDJSON wrapper around the whisper.cpp CLI."""

from __future__ import annotations

import argparse
import atexit
import http.client
import json
import os
import shutil
import subprocess
import sys
import re
import tempfile
import time
import socket
from pathlib import Path


def _configure_utf8_stdio():
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        reconfigure = getattr(stream, 'reconfigure', None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding='utf-8', errors='replace')
        except (OSError, ValueError):
            pass


_configure_utf8_stdio()

_server_process: subprocess.Popen[bytes] | None = None
_server_port: int | None = None
_server_runtime: dict[str, object] = {}

def emit(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fatal(message: str, **extra: object) -> int:
    payload: dict[str, object] = {"type": "fatal", "error": message}
    payload.update(extra)
    emit(payload)
    return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", required=True, help="whisper-cli or whisper.cpp main executable")
    parser.add_argument("--server-binary", default="", help="optional whisper-server executable for persistent model inference")
    parser.add_argument("--model", required=True, help="GGML model file")
    parser.add_argument("--language", default="en")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    parser.add_argument("--blas", action="store_true")
    parser.add_argument("--backend", choices=("auto", "vulkan", "cpu"), default="auto")
    parser.add_argument("--device", default="auto", help="Vulkan device index, or auto to select the discrete GPU")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--best-of", type=int, default=1)
    parser.add_argument("--no-fallback", action="store_true")
    flash_group = parser.add_mutually_exclusive_group()
    flash_group.add_argument("--flash-attn", dest="flash_attn", action="store_true", default=True)
    flash_group.add_argument("--no-flash-attn", dest="flash_attn", action="store_false")
    return parser.parse_args()


def _executable_available(binary: str) -> bool:
    return Path(binary).is_file() or shutil.which(binary) is not None


def _select_vulkan_device(requested: str, probe_binary: str | None = None) -> str | None:
    """Choose a discrete Vulkan adapter when no device was configured."""
    requested = str(requested or "auto").strip().lower()
    if requested != "auto":
        return requested

    executable = shutil.which("vulkaninfo")
    if executable:
        try:
            result = subprocess.run(
                [executable, "--summary"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=8,
                check=False,
            )
            output = (result.stdout or "") + "\n" + (result.stderr or "")
        except (OSError, subprocess.SubprocessError):
            output = ""
    elif probe_binary:
        try:
            result = subprocess.run(
                [probe_binary, "--help"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=12,
                check=False,
            )
            output = (result.stdout or "") + "\n" + (result.stderr or "")
        except (OSError, subprocess.SubprocessError):
            output = ""
    else:
        return None

    if not output:
        return None
    direct_devices = re.findall(r"ggml_vulkan:\s*(\d+)\s*=\s*([^\r\n]+)", output, flags=re.IGNORECASE)
    for index, description in direct_devices:
        if re.search(r"\b(?:rx|geforce|arc)\b", description, re.IGNORECASE):
            return index
    if direct_devices:
        return direct_devices[0][0]
    blocks = re.split(r"(?=^GPU\d+:)", output, flags=re.MULTILINE)
    devices: list[tuple[str, str]] = []
    for block in blocks:
        index_match = re.search(r"^GPU(\d+):", block, flags=re.MULTILINE)
        name_match = re.search(r"^\s*deviceName\s*=\s*(.+)$", block, flags=re.MULTILINE)
        type_match = re.search(r"^\s*deviceType\s*=\s*(.+)$", block, flags=re.MULTILINE)
        if not index_match:
            continue
        name = name_match.group(1).strip() if name_match else ""
        device_type = type_match.group(1).strip().lower() if type_match else ""
        devices.append((index_match.group(1), f"{name} {device_type}"))

    for index, description in devices:
        if "discrete_gpu" in description:
            return index
    for index, description in devices:
        if re.search(r"\b(?:rx|geforce|arc)\b", description, re.I):
            return index
    return devices[0][0] if devices else None


def _read_output(prefix: Path, stdout: str) -> str:
    candidates = [prefix.with_suffix(".txt"), Path(str(prefix) + ".txt")]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8", errors="replace").lstrip("\ufeff").strip()
    return stdout.strip()


def _runtime_backend(output: str, requested: str, selected_device: str | None) -> tuple[str, str]:
    """Infer the backend actually initialized by whisper.cpp logs."""
    requested = str(requested or "auto").strip().lower()
    if requested == "cpu":
        return "cpu", ""

    lower = output.lower()
    if "ggml_vulkan" in lower or "vulkan device" in lower:
        match = None
        if selected_device is not None:
            match = re.search(
                rf"(?:^|\n)\s*(?:ggml_vulkan:\s*)?{re.escape(selected_device)}\s*=\s*((?:amd|nvidia|intel)[^\r\n]+)$",
                output,
                flags=re.IGNORECASE | re.MULTILINE,
            )
        if match is None:
            match = re.search(r"\d+\s*=\s*((?:amd|nvidia|intel)[^\r\n]+)", output, flags=re.IGNORECASE)
        return "vulkan", match.group(1).strip() if match else ""
    if "ggml_cuda" in lower or "cuda" in lower and "device" in lower:
        return "cuda", ""
    return "cpu", ""


def _stop_server() -> None:
    global _server_process, _server_port, _server_runtime
    process = _server_process
    _server_process = None
    _server_port = None
    _server_runtime = {}
    if process is None:
        return
    try:
        process.terminate()
        process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        try:
            process.kill()
        except OSError:
            pass


atexit.register(_stop_server)


def _start_server(args: argparse.Namespace) -> dict[str, object]:
    """Start whisper-server once so the GGML model remains in memory."""
    global _server_process, _server_port, _server_runtime
    server_binary = str(args.server_binary or '').strip()
    if not server_binary or not _executable_available(server_binary):
        return {"mode": "cli", "reason": "whisper-server binary unavailable"}

    selected_device = None
    gpu_name = ""
    probe_backend = "cpu"
    if args.backend != "cpu":
        selected_device = _select_vulkan_device(args.device, server_binary)
        # whisper.cpp's default Vulkan device is 0. Make that choice explicit
        # when vulkaninfo is unavailable, while still preferring a named RX GPU.
        selected_device = selected_device or "0"
        try:
            probe = subprocess.run(
                [server_binary, "--help"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=12,
                check=False,
            )
            probe_backend, gpu_name = _runtime_backend(
                (probe.stdout or "") + "\n" + (probe.stderr or ""),
                args.backend,
                selected_device,
            )
        except (OSError, subprocess.SubprocessError):
            pass

    port_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        port_socket.bind(("127.0.0.1", 0))
        port = int(port_socket.getsockname()[1])
    finally:
        port_socket.close()

    command = [
        server_binary,
        "-m", args.model,
        "--host", "127.0.0.1",
        "--port", str(port),
        "-l", args.language,
        "-t", str(max(1, args.threads)),
        "-bs", str(args.beam_size),
        "-bo", str(args.best_of),
        "-nf" if args.no_fallback else "",
        "-fa" if args.flash_attn else "-nfa",
    ]
    command = [value for value in command if value]
    use_gpu = args.backend != "cpu" and probe_backend == "vulkan"
    if not use_gpu:
        command.append("-ng")
    else:
        command.extend(["-dev", selected_device or "0"])

    started = time.monotonic()
    try:
        _server_process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        return {"mode": "cli", "reason": str(exc)}

    deadline = time.monotonic() + min(60.0, max(10.0, args.timeout_seconds))
    ready = False
    while time.monotonic() < deadline:
        if _server_process.poll() is not None:
            break
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                ready = True
                break
        except OSError:
            time.sleep(0.1)

    if not ready:
        _stop_server()
        return {"mode": "cli", "reason": "whisper-server did not become ready"}

    _server_port = port
    _server_runtime = {
        "mode": "server",
        "backend": "vulkan" if use_gpu else "cpu",
        "backendRequested": args.backend,
        "device": (selected_device or "0") if use_gpu else "cpu",
        "gpuName": gpu_name if use_gpu else "",
        "modelLoadMs": int((time.monotonic() - started) * 1000),
    }
    return dict(_server_runtime)


def _multipart_body(audio_path: str) -> tuple[bytes, str]:
    boundary = "----OpenCluelyWhisper" + os.urandom(12).hex()
    audio_name = Path(audio_path).name
    audio_bytes = Path(audio_path).read_bytes()
    chunks = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{audio_name}\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
        audio_bytes,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), boundary


def _transcribe_server(args: argparse.Namespace, item: object) -> dict[str, object]:
    request_id = item.get("id") if isinstance(item, dict) else None
    audio_path = item.get("audioPath") if isinstance(item, dict) else None
    result: dict[str, object] = {
        "id": request_id or "",
        "ok": False,
        "text": "",
        "transcribeMs": 0,
        "executionMode": "server",
        "backendRequested": args.backend,
        "backendUsed": _server_runtime.get("backend", "unknown"),
        "device": _server_runtime.get("device", ""),
        "gpuName": _server_runtime.get("gpuName", ""),
    }
    if not request_id or not isinstance(audio_path, str) or not Path(audio_path).is_file():
        result["error"] = "Invalid or missing audio path"
        return result
    if _server_port is None:
        result["error"] = "whisper-server is not running"
        return result

    started = time.monotonic()
    try:
        body, boundary = _multipart_body(audio_path)
        connection = http.client.HTTPConnection("127.0.0.1", _server_port, timeout=max(1.0, args.timeout_seconds))
        try:
            connection.request(
                "POST",
                "/inference",
                body=body,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            )
            response = connection.getresponse()
            raw = response.read().decode("utf-8", errors="replace")
        finally:
            connection.close()
        if response.status < 200 or response.status >= 300:
            result["error"] = f"whisper-server HTTP {response.status}: {raw[-1000:]}"
        else:
            decoded = json.loads(raw)
            result["text"] = decoded.get("text", "") if isinstance(decoded, dict) else str(decoded)
            result["ok"] = True
    except (OSError, ValueError, json.JSONDecodeError, socket.timeout) as exc:
        result["error"] = str(exc)
    finally:
        result["transcribeMs"] = int((time.monotonic() - started) * 1000)
    return result


def _transcribe_server_if_available(args: argparse.Namespace, item: object) -> dict[str, object] | None:
    if _server_process is not None and _server_process.poll() is None:
        server_result = _transcribe_server(args, item)
        if server_result.get("ok"):
            return server_result
        # Keep the local CPU/GPU fallback alive if the optional server exits.
        _stop_server()
    return None

def _transcribe_cli(args: argparse.Namespace, item: object, selected_device: str | None) -> dict[str, object]:
    request_id = item.get("id") if isinstance(item, dict) else None
    audio_path = item.get("audioPath") if isinstance(item, dict) else None
    base_result: dict[str, object] = {
        "id": request_id or "",
        "ok": False,
        "text": "",
        "transcribeMs": 0,
        "executionMode": "cli",
        "backendRequested": args.backend,
        "backendUsed": "cpu" if args.backend == "cpu" else "unknown",
    }
    if not request_id or not isinstance(audio_path, str) or not audio_path:
        base_result["error"] = "Invalid transcription item"
        return base_result
    if not Path(audio_path).is_file():
        base_result["error"] = f"Audio file not found: {audio_path}"
        return base_result

    started = time.monotonic()
    try:
        with tempfile.TemporaryDirectory(prefix="opencluely-whisper-cpp-") as temp_dir:
            output_prefix = Path(temp_dir) / "transcript"
            command = [
                args.binary,
                "-m", args.model,
                "-f", audio_path,
                "-l", args.language,
                "-t", str(max(1, args.threads)),
                "-otxt",
                "-of", str(output_prefix),
                "-nt",
                "-np",
                "-bs", str(args.beam_size),
                "-bo", str(args.best_of),
            ]
            if args.no_fallback:
                command.append("-nf")
            if args.flash_attn:
                command.append("-fa")
            else:
                command.append("-nfa")
            if args.backend == "cpu":
                command.append("-ng")
            elif selected_device is not None:
                command.extend(["-dev", selected_device])
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=max(1.0, args.timeout_seconds),
                check=False,
            )
            diagnostics = (completed.stdout or "") + "\n" + (completed.stderr or "")
            backend, gpu_name = _runtime_backend(diagnostics, args.backend, selected_device)
            base_result["backend"] = backend
            base_result["backendUsed"] = backend
            base_result["gpuName"] = gpu_name
            base_result["device"] = selected_device or ("cpu" if args.backend == "cpu" else "auto")
            if completed.returncode != 0:
                base_result["error"] = (completed.stderr or completed.stdout or "whisper.cpp exited with code " + str(completed.returncode)).strip()[-4000:]
                return base_result
            base_result["text"] = _read_output(output_prefix, completed.stdout or "")
            base_result["ok"] = True
    except subprocess.TimeoutExpired:
        base_result["error"] = f"whisper.cpp timed out after {args.timeout_seconds:g}s"
    except OSError as exc:
        if not base_result["ok"]:
            base_result["error"] = str(exc)
    finally:
        base_result["transcribeMs"] = int((time.monotonic() - started) * 1000)
    return base_result


def main() -> int:
    args = parse_args()
    args.threads = max(1, args.threads)
    args.beam_size = max(1, args.beam_size)
    args.best_of = max(1, args.best_of)
    selected_device = _select_vulkan_device(args.device) if args.backend != "cpu" else None
    if not _executable_available(args.binary):
        return fatal(f"whisper.cpp binary not found: {args.binary}", engine="whisper-cpp")
    if not Path(args.model).is_file():
        return fatal(f"whisper.cpp model not found: {args.model}", engine="whisper-cpp")

    server_info = _start_server(args)

    emit({
        "type": "ready",
        "engine": "whisper-cpp",
        "binary": args.binary,
        "model": args.model,
        "language": args.language,
        "threads": args.threads,
        "blas": bool(args.blas),
        "backend": args.backend,
        "backendRequested": args.backend,
        "backendUsed": server_info.get("backend", "unknown"),
        "device": server_info.get("device", args.device),
        "gpuName": server_info.get("gpuName", ""),
        "executionMode": server_info.get("mode", "cli"),
        "modelLoadMs": server_info.get("modelLoadMs"),
        "beamSize": args.beam_size,
        "bestOf": args.best_of,
        "noFallback": bool(args.no_fallback),
        "flashAttention": bool(args.flash_attn),
    })

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue

        message_type = message.get("type") if isinstance(message, dict) else None
        if message_type == "stop":
            emit({"type": "stopped", "reason": "stop requested"})
            return 0
        if message_type != "transcribe":
            continue
        result = _transcribe_server_if_available(args, message)
        if result is None:
            result = _transcribe_cli(args, message, selected_device)
        result["type"] = "result"
        emit(result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        pass
