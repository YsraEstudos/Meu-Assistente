#!/usr/bin/env python3
"""Detect local GPU runtimes used by the Whisper backends.

The CUDA/ROCm fields are kept for the faster-whisper installer. Vulkan is
reported separately because an AMD GPU such as the RX 6600 can be usable by
whisper.cpp even when ROCm/HIP is unavailable on Windows.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from typing import Optional


def run_probe(command: list[str]) -> Optional[str]:
    """Return successful probe output, or None when the tool is unavailable."""
    executable = shutil.which(command[0])
    if not executable:
        return None

    try:
        result = subprocess.run(
            [executable, *command[1:]],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None
    return result.stdout.strip()


def first_non_empty_line(output: str) -> str:
    """Extract a useful GPU name from a command's human-readable output."""
    for line in output.splitlines():
        candidate = line.strip()
        if candidate:
            match = re.search(r"GPU\[\d+\]\s*:\s*(.+)$", candidate)
            return (match.group(1) if match else candidate).strip()
    return ""


def rocm_gpu_name(output: str) -> str:
    """Extract a product name from the GPU-labelled lines emitted by rocm-smi."""
    for line in output.splitlines():
        match = re.search(r"GPU\[\d+\]\s*:\s*(.+)$", line.strip())
        if not match:
            continue
        candidate = match.group(1).strip()
        candidate = re.sub(r"^Card\s+(?:series|model)\s*:\s*", "", candidate, flags=re.I)
        if candidate:
            return candidate
    return ""


def vulkan_gpu_name(output: str) -> str:
    """Extract the most useful physical-device name from vulkaninfo output."""
    names: list[str] = []
    for line in output.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        match = re.search(r"deviceName\s*[=:]\s*(.+)$", candidate, flags=re.IGNORECASE)
        if match:
            names.append(match.group(1).strip())
            continue
        match = re.search(r"GPU\s*\d+\s*[:=]\s*(.+)$", candidate, flags=re.IGNORECASE)
        if match:
            names.append(match.group(1).strip())

    if not names:
        return ""

    # Prefer a discrete Radeon/NVIDIA/Intel board over an integrated adapter.
    preferred = [
        name for name in names
        if re.search(r"\b(?:RX|GeForce|Arc)\b|discrete", name, flags=re.IGNORECASE)
    ]
    return (preferred[-1] if preferred else names[-1]).strip()


def detect_gpu() -> dict[str, object]:
    """Probe NVIDIA, AMD ROCm and the cross-vendor Vulkan runtime."""
    vulkan_output = run_probe(["vulkaninfo", "--summary"])
    vulkan_available = vulkan_output is not None
    vulkan_name = vulkan_gpu_name(vulkan_output or "")
    nvidia_name = run_probe(
        ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"]
    )
    if nvidia_name is not None:
        return {
            "device": "cuda",
            "cuda": True,
            "rocm": False,
            "gpuName": first_non_empty_line(nvidia_name) or "NVIDIA GPU",
            "vulkan": vulkan_available,
            "vulkanGpuName": vulkan_name,
        }

    rocm_name = run_probe(["rocm-smi", "--showproductname"])
    if rocm_name is not None:
        return {
            "device": "rocm",
            "cuda": False,
            "rocm": True,
            "gpuName": rocm_gpu_name(rocm_name) or "AMD GPU",
            "vulkan": vulkan_available,
            "vulkanGpuName": vulkan_name,
        }

    return {
        # Keep the legacy device contract for faster-whisper. The Vulkan
        # backend is selected by whisper.cpp through its compiled runtime.
        "device": "cpu",
        "cuda": False,
        "rocm": False,
        "gpuName": vulkan_name,
        "vulkan": vulkan_available,
        "vulkanGpuName": vulkan_name,
    }


if __name__ == "__main__":
    print(json.dumps(detect_gpu(), ensure_ascii=False, separators=(",", ":")))
