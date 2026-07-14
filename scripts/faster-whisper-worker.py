#!/usr/bin/env python3
"""Persistent Faster Whisper worker with bounded batch transcription."""

import argparse
import contextlib
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor


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

def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fatal(message, **extra):
    payload = {"type": "fatal", "error": message}
    payload.update(extra)
    emit(payload)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--model-dir", default="")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="auto")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--max-concurrent", type=int, default=4)
    return parser.parse_args()


def main():
    args = parse_args()
    beam_size = max(1, args.beam_size)
    max_concurrent = max(1, args.max_concurrent)

    try:
        with contextlib.redirect_stdout(sys.stderr):
            from faster_whisper import WhisperModel
    except Exception as exc:
        fatal(f"faster_whisper unavailable: {exc}")
        return 1

    kwargs = {"device": args.device, "compute_type": args.compute_type}
    if args.model_dir:
        kwargs["download_root"] = args.model_dir

    start = time.time()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            model = WhisperModel(args.model, **kwargs)
    except Exception as exc:
        fatal(
            f"model initialization failed: {exc}",
            engine="faster",
            device=args.device,
            computeType=args.compute_type,
        )
        return 1

    emit({
        "type": "ready",
        "engine": "faster",
        "device": args.device,
        "computeType": args.compute_type,
        "model": args.model,
        "modelDir": args.model_dir,
        "beamSize": beam_size,
        "maxConcurrent": max_concurrent,
        "modelLoadMs": int((time.time() - start) * 1000),
    })

    def transcribe_item(item):
        req_id = item.get("id") if isinstance(item, dict) else None
        audio_path = item.get("audioPath") if isinstance(item, dict) else None
        if not req_id or not isinstance(audio_path, str) or not audio_path:
            return {
                "id": req_id or "",
                "ok": False,
                "text": "",
                "transcribeMs": 0,
                "error": "Invalid transcription item",
            }

        started = time.time()
        try:
            # Do not redirect stdout here: redirect_stdout mutates the process-
            # global stream and is unsafe while ThreadPoolExecutor is active.
            segments, _info = model.transcribe(
                audio_path,
                language=args.language or None,
                beam_size=beam_size,
            )
            text = "".join(segment.text for segment in segments).strip()
            return {
                "id": req_id,
                "ok": True,
                "text": text,
                "transcribeMs": int((time.time() - started) * 1000),
            }
        except Exception as exc:
            return {
                "id": req_id,
                "ok": False,
                "text": "",
                "transcribeMs": int((time.time() - started) * 1000),
                "error": str(exc),
            }

    def transcribe_batch(items):
        workers = max(1, min(max_concurrent, len(items)))
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="faster-whisper") as executor:
            # executor.map preserves input order while work runs concurrently.
            return list(executor.map(transcribe_item, items))

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except Exception:
            continue

        message_type = message.get("type")
        if message_type == "stop":
            emit({"type": "stopped", "reason": "stop requested"})
            return 0

        if message_type == "transcribe_batch":
            batch_id = message.get("id")
            items = message.get("items")
            if not batch_id or not isinstance(items, list):
                emit({
                    "type": "batch_result",
                    "id": batch_id or "",
                    "results": [],
                    "error": "Invalid transcription batch",
                })
                continue
            started = time.time()
            results = transcribe_batch(items)
            emit({
                "type": "batch_result",
                "id": batch_id,
                "results": results,
                "batchMs": int((time.time() - started) * 1000),
            })
            continue

        if message_type != "transcribe":
            continue
        result = transcribe_item(message)
        result["type"] = "result"
        emit(result)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        pass
