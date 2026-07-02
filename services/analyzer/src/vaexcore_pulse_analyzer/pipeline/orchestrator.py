from __future__ import annotations

from datetime import datetime, timezone

from ..contracts import (
    AnalysisProvenance,
    AnalysisProvenanceState,
    MediaSource,
    ProjectSession,
    Settings,
)
from ..mock_data import build_mock_session
from .acoustic import apply_local_audio_signals, extract_feature_windows
from .boundary import apply_boundary_shaping
from .coverage import build_analysis_coverage
from .ingest import (
    INGEST_NOTE_IMPORTED_TRANSCRIPT,
    INGEST_NOTE_METADATA_FALLBACK,
    INGEST_NOTE_SEEDED_TRANSCRIPT,
    INGEST_NOTE_TRANSCRIPT_COMPLETED,
    INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE,
    inspect_media,
)
from .scoring import (
    apply_review_post_filter,
    generate_candidate_seeds,
    shape_candidates,
)
from .segmentation import create_micro_windows
from .speaker_activity import estimate_speech_regions
from .transcript import generate_transcript


def analyze_media(
    source_path: str | None,
    settings: Settings,
    profile_id: str = "generic",
    session_title: str | None = None,
    transcript_path: str | None = None,
) -> ProjectSession:
    if settings.use_mock_data:
        session = build_mock_session(settings)
        session.profile_id = profile_id
        if session_title:
            session.title = session_title
        session.analysis_provenance = AnalysisProvenance(
            state=AnalysisProvenanceState.MOCK,
            transcript_source="mock",
            audio_signal_source="mock",
            notes=["Deterministic mock session used for tests and demos."],
        )
        return session

    media_source = inspect_media(source_path, use_mock_data=False)
    micro_windows = create_micro_windows(
        media_source.duration_seconds,
        settings.micro_window_seconds,
    )
    transcript = generate_transcript(media_source, settings, transcript_path)
    speech_regions = estimate_speech_regions(transcript)
    feature_windows = extract_feature_windows(
        micro_windows,
        transcript,
        speech_regions,
    )
    audio_signal_analysis = apply_local_audio_signals(media_source, feature_windows)
    feature_windows = audio_signal_analysis.feature_windows
    media_source.ingest_notes.extend(audio_signal_analysis.notes)
    candidate_seeds = generate_candidate_seeds(
        transcript,
        speech_regions,
        feature_windows,
        settings,
        media_source.duration_seconds,
    )
    candidates = apply_boundary_shaping(
        shape_candidates(candidate_seeds, settings),
        settings,
    )
    analysis_coverage = build_analysis_coverage(
        media_source,
        transcript,
        candidates,
        settings,
    )
    analysis_provenance = _build_analysis_provenance(
        media_source,
        audio_signal_analysis.status,
        audio_signal_analysis.source,
        candidate_count=len(candidates),
    )
    candidates = apply_review_post_filter(
        candidates,
        feature_windows,
        speech_regions,
        analysis_coverage,
    )
    for index, candidate in enumerate(candidates, start=1):
        candidate.id = f"{media_source.id}_candidate_{index:03d}"
    now = datetime.now(timezone.utc).isoformat()

    return ProjectSession(
        id=f"session_{media_source.id}",
        title=session_title or f"Review for {media_source.file_name}",
        status="READY",
        media_source=media_source,
        profile_id=profile_id,
        settings=settings,
        transcript=transcript,
        speech_regions=speech_regions,
        feature_windows=feature_windows,
        candidates=candidates,
        review_decisions=[],
        created_at=now,
        updated_at=now,
        analysis_coverage=analysis_coverage,
        analysis_provenance=analysis_provenance,
    )


def _build_analysis_provenance(
    media_source: MediaSource,
    audio_signal_status: str,
    audio_signal_source: str,
    *,
    candidate_count: int,
) -> AnalysisProvenance:
    transcript_source = _transcript_source(media_source.ingest_notes)
    if candidate_count == 0:
        state = AnalysisProvenanceState.FAILED
    elif (
        audio_signal_status == "real"
        and transcript_source in {"imported", "local-provider"}
        and INGEST_NOTE_METADATA_FALLBACK not in media_source.ingest_notes
    ):
        state = AnalysisProvenanceState.REAL
    else:
        state = AnalysisProvenanceState.PARTIAL

    notes = [
        f"Transcript source: {transcript_source}.",
        f"Audio signal source: {audio_signal_source} ({audio_signal_status}).",
    ]
    if INGEST_NOTE_METADATA_FALLBACK in media_source.ingest_notes:
        notes.append("Media metadata fell back to local duration heuristics.")
    if INGEST_NOTE_SEEDED_TRANSCRIPT in media_source.ingest_notes:
        notes.append("Seeded transcript anchors were used for coverage.")

    return AnalysisProvenance(
        state=state,
        transcript_source=transcript_source,
        audio_signal_source=audio_signal_source,
        notes=notes,
    )


def _transcript_source(ingest_notes: list[str]) -> str:
    if INGEST_NOTE_IMPORTED_TRANSCRIPT in ingest_notes:
        return "imported"
    if INGEST_NOTE_TRANSCRIPT_COMPLETED in ingest_notes:
        return "local-provider"
    if INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE in ingest_notes:
        return "provider-unavailable"
    if INGEST_NOTE_SEEDED_TRANSCRIPT in ingest_notes:
        return "seeded-local"
    return "unknown"
