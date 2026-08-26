#!/usr/bin/env python3
"""Report CPU features and OpenBLAS availability as one JSON object."""

from __future__ import annotations

import ctypes
import ctypes.util
import json
import os
import platform
import re
import subprocess
import sys
from typing import Iterable


def _run(command: list[str], timeout: float = 5.0) -> str:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return (result.stdout or "").strip()


def _cpu_details() -> tuple[str, str, set[str]]:
    system = platform.system().lower()
    cpu_name = ""
    vendor_text = ""
    flags: set[str] = set()

    if system == "windows":
        feature_output = _run([
            "pwsh",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "try { $a = [System.Runtime.Intrinsics.X86.Avx2]::IsSupported } catch { $a = $false }; try { $b = [System.Runtime.Intrinsics.X86.Avx512F]::IsSupported } catch { $b = $false }; Write-Output (\"$a|$b\")",
        ])
        if "|" not in feature_output:
            feature_output = _run([
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "try { $a = [System.Runtime.Intrinsics.X86.Avx2]::IsSupported } catch { $a = $false }; try { $b = [System.Runtime.Intrinsics.X86.Avx512F]::IsSupported } catch { $b = $false }; Write-Output (\"$a|$b\")",
            ])
        feature_values = [value.strip().lower() == "true" for value in feature_output.split("|", 1)]
        if len(feature_values) == 2:
            if feature_values[0]:
                flags.add("avx2")
            if feature_values[1]:
                flags.add("avx512f")

        output = _run([
            "pwsh",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)",
        ])
        if not output:
            output = _run([
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)",
            ])
        cpu_name = output or cpu_name
    elif system == "darwin":
        cpu_name = _run(["sysctl", "-n", "machdep.cpu.brand_string"]) or cpu_name
        feature_text = " ".join([
            _run(["sysctl", "-n", "machdep.cpu.features"]),
            _run(["sysctl", "-n", "machdep.cpu.leaf7_features"]),
        ])
        flags.update(feature_text.lower().split())
    elif system == "linux":
        try:
            with open("/proc/cpuinfo", "r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    key, _, value = line.partition(":")
                    normalized = key.strip().lower()
                    if normalized in {"model name", "hardware"} and not cpu_name:
                        cpu_name = value.strip()
                    elif normalized in {"vendor_id", "cpu implementer"} and not vendor_text:
                        vendor_text = value.strip()
                    elif normalized in {"flags", "features"}:
                        flags.update(value.lower().split())
        except OSError:
            pass

    if not cpu_name:
        cpu_name = platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "")
    if not vendor_text:
        vendor_text = os.environ.get("PROCESSOR_IDENTIFIER", "") or cpu_name
    return cpu_name.strip(), vendor_text.strip(), flags


def _normalise_vendor(cpu_name: str, vendor_text: str) -> str:
    value = f"{vendor_text} {cpu_name}".lower()
    if "amd" in value or "authenticamd" in value:
        return "AMD"
    if "intel" in value or "genuineintel" in value:
        return "Intel"
    if "apple" in value or "arm" in value or "aarch" in value:
        return "ARM"
    return "unknown"


def _openblas_candidates() -> Iterable[str]:
    names = (
        "openblas",
        "libopenblas.so",
        "libopenblas.so.0",
        "libopenblas.dylib",
        "libopenblas.dll",
        "openblas.dll",
    )
    seen: set[str] = set()
    for name in names:
        candidate = ctypes.util.find_library(name) or name
        if candidate not in seen:
            seen.add(candidate)
            yield candidate


def _detect_openblas() -> tuple[bool, str | None]:
    for candidate in _openblas_candidates():
        try:
            library = ctypes.CDLL(candidate)
        except OSError:
            continue

        version: str | None = None
        try:
            getter = library.openblas_get_config
            getter.restype = ctypes.c_char_p
            raw = getter()
            if raw:
                version = raw.decode("utf-8", errors="replace").strip()
        except (AttributeError, OSError):
            pass
        return True, version
    return False, None


def detect() -> dict[str, object]:
    cpu_name, vendor_text, flags = _cpu_details()
    blas_available, openblas_version = _detect_openblas()
    has_avx512 = any(flag.startswith("avx512") for flag in flags)
    return {
        "vendor": _normalise_vendor(cpu_name, vendor_text),
        "cpuName": cpu_name,
        "has_avx2": "avx2" in flags,
        "has_avx512": has_avx512,
        "blas_available": blas_available,
        "openblas_version": openblas_version,
        "logical_cpus": os.cpu_count() or 1,
        "platform": sys.platform,
    }


def main() -> int:
    print(json.dumps(detect(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
