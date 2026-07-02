from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from ..contracts import MediaSource, TranscriptChunk

WHISPER_TIMEOUT_SECONDS = 180


class LocalTranscriptProvider:
    """Loads local transcript output without sending media to a network service."""

    def transcribe(self, media_source: MediaSource) -> list[TranscriptChunk]:
        source_path = Path(media_source.path)
        sidecar = _read_sidecar_transcript(source_path)
        if sidecar:
            return sidecar

        return _run_whisper_cli(source_path)


def _read_sidecar_transcript(source_path: Path) -> list[TranscriptChunk]:
    for path in _sidecar_candidates(source_path):
        if not path.exists() or not path.is_file():
            continue
        try:
            transcript = _parse_transcript_file(path)
        except (OSError, json.JSONDecodeError, ValueError):
            continue
        if transcript:
            return transcript
    return []


def read_transcript_file(transcript_path: str | Path) -> list[TranscriptChunk]:
    path = Path(transcript_path).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(f"Transcript file not found: {path}")
    if not path.is_file():
        raise ValueError(f"Transcript path must point to a regular file: {path}")

    transcript = _parse_transcript_file(path)
    if not transcript:
        raise ValueError(
            f"Transcript file did not contain usable transcript cues: {path.name}"
        )
    return transcript


def _sidecar_candidates(source_path: Path) -> list[Path]:
    base = source_path.with_suffix("")
    return [
        base.with_suffix(".transcript.json"),
        base.with_suffix(".json"),
        base.with_suffix(".srt"),
        base.with_suffix(".vtt"),
        base.with_suffix(".txt"),
    ]


def _parse_transcript_file(path: Path) -> list[TranscriptChunk]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        return _parse_json_transcript(path)
    if suffix == ".srt":
        return _parse_srt(path.read_text(encoding="utf-8"))
    if suffix == ".vtt":
        return _parse_vtt(path.read_text(encoding="utf-8"))
    if suffix in {".txt", ".text"}:
        return _parse_plain_text(path.read_text(encoding="utf-8"))
    raise ValueError(f"Unsupported transcript extension: {path.suffix}")


def _run_whisper_cli(source_path: Path) -> list[TranscriptChunk]:
    executable = (
        os.environ.get("VAEXCORE_PULSE_WHISPER_CLI")
        or shutil.which("whisper-cli")
        or shutil.which("whisper")
    )
    model_path = os.environ.get("VAEXCORE_PULSE_WHISPER_MODEL")
    if not executable:
        return []

    output_dir = source_path.parent
    command = [executable, str(source_path)]
    if model_path:
        command.extend(["--model", model_path])
    if "whisper-cli" in Path(executable).name:
        command.extend(["--output-json", "--output-file", str(output_dir / source_path.stem)])
    else:
        command.extend(["--output_format", "json", "--output_dir", str(output_dir)])

    try:
        subprocess.run(
            command,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=WHISPER_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    return _read_sidecar_transcript(source_path)


def _parse_json_transcript(path: Path) -> list[TranscriptChunk]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict):
        records = (
            payload.get("segments")
            or payload.get("transcript")
            or payload.get("chunks")
            or []
        )
    else:
        records = []

    transcript: list[TranscriptChunk] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            continue
        text = str(record.get("text") or "").strip()
        if not text:
            continue
        start = _float(record.get("start") or record.get("start_seconds"), 0.0)
        end = _float(
            record.get("end") or record.get("end_seconds"),
            max(start + 1.0, start),
        )
        transcript.append(_chunk(index, start, end, text, record.get("confidence")))
    return transcript


def _parse_srt(value: str) -> list[TranscriptChunk]:
    blocks = re.split(r"\n\s*\n", value.strip())
    transcript: list[TranscriptChunk] = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        time_line = next((line for line in lines if "-->" in line), "")
        if not time_line:
            continue
        text = " ".join(line for line in lines if line != time_line and not line.isdigit())
        if not text:
            continue
        start_raw, end_raw = [part.strip() for part in time_line.split("-->", 1)]
        transcript.append(
            _chunk(
                len(transcript) + 1,
                _parse_timestamp(start_raw),
                _parse_timestamp(end_raw),
                text,
                None,
            )
        )
    return transcript


def _parse_vtt(value: str) -> list[TranscriptChunk]:
    cleaned = "\n".join(
        line for line in value.splitlines() if line.strip().upper() != "WEBVTT"
    )
    return _parse_srt(cleaned)


def _parse_plain_text(value: str) -> list[TranscriptChunk]:
    timestamped = _parse_timestamped_text(value)
    if timestamped:
        return timestamped

    lines = [line.strip() for line in value.splitlines() if line.strip()]
    return [
        _chunk(index, (index - 1) * 8.0, index * 8.0, line, None)
        for index, line in enumerate(lines, start=1)
    ]


def _parse_timestamped_text(value: str) -> list[TranscriptChunk]:
    records: list[tuple[float, float | None, str]] = []
    for line in value.splitlines():
        match = re.match(
            r"^\s*\[?(?P<start>\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)\]?\s*"
            r"(?:(?:-->|-|to)\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?)\s*)?"
            r"(?:[-–:]\s*)?(?P<text>.+?)\s*$",
            line,
            re.IGNORECASE,
        )
        if not match:
            continue
        text = match.group("text").strip()
        if not text:
            continue
        records.append(
            (
                _parse_timestamp(match.group("start")),
                _parse_timestamp(match.group("end"))
                if match.group("end")
                else None,
                text,
            )
        )

    transcript: list[TranscriptChunk] = []
    for index, (start, explicit_end, text) in enumerate(records, start=1):
        next_start = records[index][0] if index < len(records) else None
        end = explicit_end or next_start or start + 8.0
        transcript.append(_chunk(index, start, end, text, None))
    return transcript


def _chunk(
    index: int,
    start: float,
    end: float,
    text: str,
    confidence: Any,
) -> TranscriptChunk:
    normalized_end = end if end > start else start + 1.0
    return TranscriptChunk(
        id=f"chunk_{index:03d}",
        start_seconds=round(max(start, 0.0), 2),
        end_seconds=round(max(normalized_end, 0.01), 2),
        text=text,
        confidence=_optional_confidence(confidence),
    )


def _parse_timestamp(value: str) -> float:
    normalized = value.replace(",", ".")
    parts = normalized.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if len(parts) == 2:
        minutes, seconds = parts
        return int(minutes) * 60 + float(seconds)
    return float(normalized)


def _optional_confidence(value: Any) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, _float(value, 0.0)))


def _float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback
