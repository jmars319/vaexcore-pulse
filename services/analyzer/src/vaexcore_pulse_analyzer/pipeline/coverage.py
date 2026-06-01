from __future__ import annotations

from ..contracts import (
    AnalysisCoverage,
    AnalysisCoverageBand,
    AnalysisCoverageFlag,
    CandidateWindow,
    MediaSource,
    Settings,
    TranscriptChunk,
)
from .ingest import INGEST_NOTE_METADATA_FALLBACK, INGEST_NOTE_SEEDED_TRANSCRIPT

THIN_TRANSCRIPT_DENSITY = 1.0
PARTIAL_TRANSCRIPT_DENSITY = 2.0


def build_analysis_coverage(
    media_source: MediaSource,
    transcript: list[TranscriptChunk],
    candidates: list[CandidateWindow],
    settings: Settings,
) -> AnalysisCoverage:
    flags: list[AnalysisCoverageFlag] = []
    transcript_density = _transcript_chunk_density(
        transcript_count=len(transcript),
        duration_seconds=media_source.duration_seconds,
    )

    if INGEST_NOTE_METADATA_FALLBACK in media_source.ingest_notes:
        flags.append(AnalysisCoverageFlag.METADATA_FALLBACK_USED)

    if (
        settings.transcript_provider == "stub-local"
        or INGEST_NOTE_SEEDED_TRANSCRIPT in media_source.ingest_notes
    ):
        flags.append(AnalysisCoverageFlag.SEEDED_TRANSCRIPT)

    if len(transcript) == 0 or transcript_density < THIN_TRANSCRIPT_DENSITY:
        flags.append(AnalysisCoverageFlag.TRANSCRIPT_SPARSE)

    if len(candidates) == 0:
        flags.append(AnalysisCoverageFlag.NO_CANDIDATES)
    elif len(candidates) <= 2:
        flags.append(AnalysisCoverageFlag.LOW_CANDIDATE_COUNT)

    band = _coverage_band(flags, transcript_density=transcript_density)
    note = _coverage_note(band, flags)
    return AnalysisCoverage(
        band=band,
        note=note,
        flags=_deduplicate_flags(flags),
    )


def _coverage_band(
    flags: list[AnalysisCoverageFlag],
    *,
    transcript_density: float,
) -> AnalysisCoverageBand:
    unique_flags = set(flags)
    if AnalysisCoverageFlag.NO_CANDIDATES in unique_flags:
        return AnalysisCoverageBand.THIN

    if (
        AnalysisCoverageFlag.TRANSCRIPT_SPARSE in unique_flags
        and AnalysisCoverageFlag.METADATA_FALLBACK_USED in unique_flags
    ):
        return AnalysisCoverageBand.THIN

    if transcript_density < THIN_TRANSCRIPT_DENSITY:
        return AnalysisCoverageBand.THIN

    if (
        AnalysisCoverageFlag.SEEDED_TRANSCRIPT in unique_flags
        or AnalysisCoverageFlag.TRANSCRIPT_SPARSE in unique_flags
        or AnalysisCoverageFlag.METADATA_FALLBACK_USED in unique_flags
        or AnalysisCoverageFlag.LOW_CANDIDATE_COUNT in unique_flags
        or transcript_density < PARTIAL_TRANSCRIPT_DENSITY
    ):
        return AnalysisCoverageBand.PARTIAL

    return AnalysisCoverageBand.STRONG


def _coverage_note(
    band: AnalysisCoverageBand,
    flags: list[AnalysisCoverageFlag],
) -> str:
    reason_copy = {
        AnalysisCoverageFlag.NO_CANDIDATES: "no candidate windows were produced",
        AnalysisCoverageFlag.METADATA_FALLBACK_USED: "media metadata had to be estimated",
        AnalysisCoverageFlag.TRANSCRIPT_SPARSE: "transcript coverage is sparse",
        AnalysisCoverageFlag.SEEDED_TRANSCRIPT: "transcript coverage is still limited",
        AnalysisCoverageFlag.LOW_CANDIDATE_COUNT: "only a few candidate windows were produced",
    }
    ordered_reasons = [
        reason_copy[flag]
        for flag in (
            AnalysisCoverageFlag.NO_CANDIDATES,
            AnalysisCoverageFlag.METADATA_FALLBACK_USED,
            AnalysisCoverageFlag.TRANSCRIPT_SPARSE,
            AnalysisCoverageFlag.SEEDED_TRANSCRIPT,
            AnalysisCoverageFlag.LOW_CANDIDATE_COUNT,
        )
        if flag in flags
    ]

    if band == AnalysisCoverageBand.STRONG:
        return (
            "Strong coverage for this local pass. The session returned enough "
            "transcript and candidate detail to review normally."
        )

    if band == AnalysisCoverageBand.THIN:
        reasons = "; ".join(ordered_reasons[:3]) or "analysis coverage is limited"
        return (
            f"Thin coverage: {reasons}. Treat weaker candidates as exploratory "
            "and lean on timeline context before accepting them."
        )

    reasons = "; ".join(ordered_reasons[:3]) or "analysis coverage is provisional"
    return (
        f"Partial coverage: {reasons}. Review with normal caution and lean on "
        "timeline and transcript context rather than confidence alone."
    )


def _deduplicate_flags(
    flags: list[AnalysisCoverageFlag],
) -> list[AnalysisCoverageFlag]:
    deduped: list[AnalysisCoverageFlag] = []
    seen = set()

    for flag in flags:
        if flag in seen:
            continue
        seen.add(flag)
        deduped.append(flag)

    return deduped


def _transcript_chunk_density(
    *,
    transcript_count: int,
    duration_seconds: float,
) -> float:
    normalized_quarter_hours = max(duration_seconds / 900.0, 1.0)
    return transcript_count / normalized_quarter_hours
