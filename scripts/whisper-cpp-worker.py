#!/usr/bin/env python3
"""Persistent NDJSON wrapper around the whisper.cpp CLI."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import re
import tempfile
import time
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
    parser.add_argument("--model", required=True, help="GGML model file")
    parser.add_argument("--language", default="en")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    parser.add_argument("--blas", action="store_true")
    parser.add_argument("--backend", choices=("auto", "vulkan", "cpu"), default="auto")
    parser.add_argument("--device", default="auto", help="Vulkan device index, or auto to select the discrete GPU")
    return parser.parse_args()


def _executable_available(binary: str) -> bool:
    return Path(binary).is_file() or shutil.which(binary) is not None


def _select_vulkan_device(requested: str) -> str | None:
    """Choose a discrete Vulkan adapter when no device was configured."""
    requested = str(requested or "auto").strip().lower()
    if requested != "auto":
        return requested

    executable = shutil.which("vulkaninfo")
    if not executable:
        return None
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
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None

    output = (result.stdout or "") + "\n" + (result.stderr or "")
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
    if requested == "cpu":
        return "cpu", ""
    return "cpu", ""


def _transcribe(args: argparse.Namespace, item: object) -> dict[str, object]:
    request_id = item.get("id") if isinstance(item, dict) else None
    audio_path = item.get("audioPath") if isinstance(item, dict) else None
    base_result: dict[str, object] = {
        "id": request_id or "",
        "ok": False,
        "text": "",
        "transcribeMs": 0,
    }
    if not request_id or not isinstance(audio_path, str) or not audio_path:
        base_result["error"] = "Invalid transcription item"
        return base_result
    if not Path(audio_path).is_file():
        base_result["error"] = f"Audio file not found: {audio_path}"
        return base_result

    started = time.monotonic()
    selected_device = _select_vulkan_device(args.device) if args.backend != "cpu" else None
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
            ]
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
            base_result["gpuName"] = gpu_name
            base_result["device"] = selected_device or "auto"
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
    if not _executable_available(args.binary):
        return fatal(f"whisper.cpp binary not found: {args.binary}", engine="whisper-cpp")
    if not Path(args.model).is_file():
        return fatal(f"whisper.cpp model not found: {args.model}", engine="whisper-cpp")

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
        "device": args.device,
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
        result = _transcribe(args, message)
        result["type"] = "result"
        emit(result)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        pass
