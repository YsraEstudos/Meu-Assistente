#!/usr/bin/env python3
"""Persistent local Whisper worker used by the Electron main process.

The protocol is newline-delimited JSON on stdin/stdout. Audio is never written
to stdout or logs: requests contain only an already-created temporary WAV path.
"""

import argparse
import contextlib
import json
import sys
import time
import traceback


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

def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--model-dir", default="")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        started_at = time.perf_counter()
        # Keep Whisper's incidental output off stdout because stdout is the IPC
        # channel. stderr is captured by Electron only for diagnostic metadata.
        with contextlib.redirect_stdout(sys.stderr):
            import whisper
            model = whisper.load_model(
                args.model,
                download_root=args.model_dir or None,
            )
        send({
            "type": "ready",
            "modelLoadMs": round((time.perf_counter() - started_at) * 1000),
        })
    except Exception as error:
        send({
            "type": "fatal",
            "error": str(error),
        })
        return 1

    for raw_line in sys.stdin:
        try:
            request = json.loads(raw_line)
        except json.JSONDecodeError:
            continue

        request_type = request.get("type")
        if request_type == "shutdown":
            send({"type": "stopped"})
            return 0
        if request_type != "transcribe":
            continue

        request_id = request.get("id")
        audio_path = request.get("audioPath")
        if not request_id or not isinstance(audio_path, str):
            send({
                "type": "result",
                "id": request_id,
                "ok": False,
                "error": "Invalid transcription request",
            })
            continue

        started_at = time.perf_counter()
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = model.transcribe(
                    audio_path,
                    language=args.language or None,
                    task="transcribe",
                    fp16=False,
                    verbose=False,
                )
            send({
                "type": "result",
                "id": request_id,
                "ok": True,
                "text": (result.get("text") or "").strip(),
                "transcribeMs": round((time.perf_counter() - started_at) * 1000),
            })
        except Exception as error:
            send({
                "type": "result",
                "id": request_id,
                "ok": False,
                "error": str(error),
                "transcribeMs": round((time.perf_counter() - started_at) * 1000),
            })
            traceback.print_exc(file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
