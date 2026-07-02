from __future__ import annotations

from datetime import datetime, timezone

from ..contracts import ProjectSession, Settings
from ..mock_data import build_mock_session
from .acoustic import extract_feature_windows
from .boundary import apply_boundary_shaping
from .coverage import build_analysis_coverage
from .ingest import inspect_media
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
        return session

    media_source = inspect_media(source_path, use_mock_data=False)
    micro_windows = create_micro_windows(
        media_source.duration_seconds,
        settings.micro_window_seconds,
    )
    transcript = generate_transcript(media_source, settings, transcript_path)
    speech_regions = estimate_speech_regions(transcript)
    feature_windows = extract_feature_windows(micro_windows, transcript, speech_regions)
    candidate_seeds = generate_candidate_seeds(
        transcript,
        speech_regions,
        feature_windows,
        settings,
        media_source.duration_seconds,
    )
    candidates = apply_boundary_shaping(shape_candidates(candidate_seeds, settings), settings)
    analysis_coverage = build_analysis_coverage(
        media_source,
        transcript,
        candidates,
        settings,
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
    )
