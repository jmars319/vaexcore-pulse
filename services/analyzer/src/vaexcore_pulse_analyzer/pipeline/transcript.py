from __future__ import annotations

from ..contracts import MediaSource, Settings, TranscriptChunk
from ..providers.local_transcript import LocalTranscriptProvider
from ..providers.stub_transcript import StubTranscriptProvider
from .ingest import (
    INGEST_NOTE_SEEDED_TRANSCRIPT,
    INGEST_NOTE_TRANSCRIPT_COMPLETED,
    INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE,
)


def generate_transcript(
    media_source: MediaSource,
    settings: Settings,
) -> list[TranscriptChunk]:
    if settings.transcript_provider != "stub-local":
        transcript = LocalTranscriptProvider().transcribe(media_source)
        if transcript:
            media_source.ingest_notes.append(INGEST_NOTE_TRANSCRIPT_COMPLETED)
            return transcript
        media_source.ingest_notes.append(INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE)

    media_source.ingest_notes.append(INGEST_NOTE_SEEDED_TRANSCRIPT)
    return StubTranscriptProvider().transcribe(media_source)
