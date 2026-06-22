from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone

from ..contracts import (
    CandidateProfileMatch,
    CandidateProfileMatchStatus,
    CandidateProfileMatchStrength,
    CandidateWindow,
    ContentProfile,
    ExampleClip,
    ExampleClipFeatureSummary,
    ExampleClipSourceType,
    FeatureWindow,
    ProfileMatchingMethod,
    ReasonCode,
    ReviewTag,
    Settings,
)
from .acoustic import extract_feature_windows
from .coverage import build_analysis_coverage
from .ingest import inspect_media
from .scoring import generate_candidate_seeds, shape_candidates
from .segmentation import create_micro_windows
from .speaker_activity import estimate_speech_regions
from .transcript import generate_transcript

# Matching method contract
LOCAL_FILE_HEURISTIC_VERSION = "LOCAL_FILE_HEURISTIC_V2"
TRANSCRIPT_ANCHOR_STOPWORDS = {
    "about",
    "after",
    "before",
    "could",
    "from",
    "have",
    "just",
    "near",
    "seeded",
    "local",
    "anchor",
    "really",
    "should",
    "there",
    "these",
    "they",
    "this",
    "those",
    "what",
    "when",
    "were",
    "with",
    "would",
    "your",
}


@dataclass
class CandidateFeatureSummary:
    duration_seconds: float
    speech_density_mean: float
    speech_density_peak: float
    energy_mean: float
    energy_peak: float
    pacing_mean: float
    overlap_activity_mean: float
    high_activity_share: float
    reason_codes: list[ReasonCode]
    review_tags: list[ReviewTag]
    transcript_anchor_terms: list[str]
    transcript_anchor_phrases: list[str]


@dataclass
class ExampleComparison:
    example_id: str
    score: float
    factor_keys: list[str]
    supporting_factors: list[str]
    limiting_factors: list[str]


# Example feature boundary
def build_local_example_feature_summary(
    source_path: str,
    settings: Settings,
) -> ExampleClipFeatureSummary:
    media_source = inspect_media(source_path, use_mock_data=False)
    transcript = generate_transcript(media_source, settings)
    speech_regions = estimate_speech_regions(transcript)
    feature_windows = extract_feature_windows(
        create_micro_windows(media_source.duration_seconds, settings.micro_window_seconds),
        transcript,
        speech_regions,
    )
    candidate_seeds = generate_candidate_seeds(
        transcript,
        speech_regions,
        feature_windows,
        settings,
        media_source.duration_seconds,
    )
    provisional_candidates = shape_candidates(candidate_seeds, settings)
    coverage = build_analysis_coverage(
        media_source,
        transcript,
        provisional_candidates,
        settings,
    )

    reason_code_counts: dict[ReasonCode, int] = {}
    for candidate in provisional_candidates:
        for reason_code in candidate.reason_codes:
            reason_code_counts[reason_code] = reason_code_counts.get(reason_code, 0) + 1

    top_reason_codes = [
        reason_code
        for reason_code, _count in sorted(
            reason_code_counts.items(),
            key=lambda item: (-item[1], item[0].value),
        )[:3]
    ]
    transcript_anchor_terms, transcript_anchor_phrases = _extract_transcript_anchors(
        [chunk.text for chunk in transcript],
    )
    duration_seconds = max(media_source.duration_seconds, 1.0)
    now = datetime.now(timezone.utc).isoformat()

    return ExampleClipFeatureSummary(
        method_version=LOCAL_FILE_HEURISTIC_VERSION,
        generated_at=now,
        duration_seconds=duration_seconds,
        transcript_chunk_count=len(transcript),
        transcript_density_per_minute=_density_per_minute(
            len(transcript),
            duration_seconds,
        ),
        candidate_seed_count=len(candidate_seeds),
        candidate_density_per_minute=_density_per_minute(
            len(candidate_seeds),
            duration_seconds,
        ),
        transcript_anchor_terms=transcript_anchor_terms,
        transcript_anchor_phrases=transcript_anchor_phrases,
        speech_density_mean=_mean(
            [window.speech_density for window in feature_windows],
            fallback=0.0,
        ),
        speech_density_peak=max(
            [window.speech_density for window in feature_windows],
            default=0.0,
        ),
        energy_mean=_mean(
            [window.rms_loudness for window in feature_windows],
            fallback=0.0,
        ),
        energy_peak=max(
            [window.rms_loudness for window in feature_windows],
            default=0.0,
        ),
        pacing_mean=_mean(
            [window.onset_density for window in feature_windows],
            fallback=0.0,
        ),
        overlap_activity_mean=_mean(
            [window.overlap_activity for window in feature_windows],
            fallback=0.0,
        ),
        high_activity_share=_high_activity_share(feature_windows),
        top_reason_codes=top_reason_codes,
        coverage_band=coverage.band,
        coverage_flags=coverage.flags,
    )


# Profile match boundary
def build_profile_match(
    candidate: CandidateWindow,
    feature_windows: list[FeatureWindow],
    profile: ContentProfile,
) -> CandidateProfileMatch:
    usable_examples = [
        example
        for example in profile.example_clips
        if example.feature_summary is not None
    ]
    now = datetime.now(timezone.utc).isoformat()

    if not usable_examples:
        return CandidateProfileMatch(
            profile_id=profile.id,
            method=ProfileMatchingMethod.NONE,
            status=CandidateProfileMatchStatus.PLACEHOLDER,
            strength=CandidateProfileMatchStrength.UNASSESSED,
            note=_unavailable_match_note(profile),
            matched_example_clip_ids=[],
            compared_example_count=0,
            supporting_factors=[],
            limiting_factors=[],
            similarity_score=None,
            updated_at=now,
        )

    candidate_summary = build_candidate_feature_summary(candidate, feature_windows)
    comparisons = [
        _compare_candidate_to_example(candidate_summary, example)
        for example in usable_examples
    ]
    ranked_comparisons = sorted(
        comparisons,
        key=lambda comparison: comparison.score,
        reverse=True,
    )
    primary_comparisons = ranked_comparisons[: max(1, min(2, len(ranked_comparisons)))]
    aggregate_score = _mean(
        [comparison.score for comparison in primary_comparisons],
        fallback=0.0,
    )
    supporting_factors = _deduplicate_text(
        factor
        for comparison in primary_comparisons
        for factor in comparison.supporting_factors
    )[:4]
    limiting_factors = _deduplicate_text(
        factor
        for comparison in primary_comparisons
        for factor in comparison.limiting_factors
    )[:3]
    factor_keys = {
        factor_key
        for comparison in primary_comparisons
        for factor_key in comparison.factor_keys
    }
    matched_example_clip_ids = [
        comparison.example_id
        for comparison in ranked_comparisons
        if comparison.score >= 0.45
    ][:2]
    strength = _match_strength(
        aggregate_score,
        factor_keys=factor_keys,
        limiting_factor_count=len(limiting_factors),
    )

    return CandidateProfileMatch(
        profile_id=profile.id,
        method=ProfileMatchingMethod.LOCAL_FILE_HEURISTIC,
        status=CandidateProfileMatchStatus.HEURISTIC,
        strength=strength,
        note=_match_note(
            strength,
            usable_example_count=len(usable_examples),
            supporting_factors=supporting_factors,
            limiting_factors=limiting_factors,
        ),
        matched_example_clip_ids=matched_example_clip_ids,
        compared_example_count=len(usable_examples),
        supporting_factors=supporting_factors,
        limiting_factors=limiting_factors,
        similarity_score=round(max(0.0, min(aggregate_score, 1.0)), 2),
        updated_at=now,
    )


# Candidate feature boundary
def build_candidate_feature_summary(
    candidate: CandidateWindow,
    feature_windows: list[FeatureWindow],
) -> CandidateFeatureSummary:
    overlapping_windows = [
        window
        for window in feature_windows
        if window.start_seconds < candidate.suggested_segment.end_seconds
        and window.end_seconds > candidate.suggested_segment.start_seconds
    ]
    if not overlapping_windows:
        overlapping_windows = [
            window
            for window in feature_windows
            if window.start_seconds < candidate.candidate_window.end_seconds
            and window.end_seconds > candidate.candidate_window.start_seconds
        ]
    transcript_anchor_terms, transcript_anchor_phrases = _extract_transcript_anchors(
        [candidate.transcript_snippet],
    )

    return CandidateFeatureSummary(
        duration_seconds=max(
            candidate.suggested_segment.end_seconds
            - candidate.suggested_segment.start_seconds,
            1.0,
        ),
        speech_density_mean=_mean(
            [window.speech_density for window in overlapping_windows],
            fallback=0.0,
        ),
        speech_density_peak=max(
            [window.speech_density for window in overlapping_windows],
            default=0.0,
        ),
        energy_mean=_mean(
            [window.rms_loudness for window in overlapping_windows],
            fallback=0.0,
        ),
        energy_peak=max(
            [window.rms_loudness for window in overlapping_windows],
            default=0.0,
        ),
        pacing_mean=_mean(
            [window.onset_density for window in overlapping_windows],
            fallback=0.0,
        ),
        overlap_activity_mean=_mean(
            [window.overlap_activity for window in overlapping_windows],
            fallback=0.0,
        ),
        high_activity_share=_high_activity_share(overlapping_windows),
        reason_codes=list(candidate.reason_codes),
        review_tags=list(candidate.review_tags),
        transcript_anchor_terms=transcript_anchor_terms,
        transcript_anchor_phrases=transcript_anchor_phrases,
    )


# Similarity scoring boundary
def _compare_candidate_to_example(
    candidate_summary: CandidateFeatureSummary,
    example: ExampleClip,
) -> ExampleComparison:
    if example.feature_summary is None:
        return ExampleComparison(
            example_id=example.id,
            score=0.0,
            factor_keys=[],
            supporting_factors=[],
            limiting_factors=["This example does not have a local feature summary yet."],
        )

    summary = example.feature_summary
    score = 0.0
    factor_keys: list[str] = []
    supporting_factors: list[str] = []
    limiting_factors: list[str] = []

    duration_ratio = candidate_summary.duration_seconds / max(summary.duration_seconds, 1.0)
    if 0.72 <= duration_ratio <= 1.38:
        score += 0.18
        factor_keys.append("duration")
        supporting_factors.append("Duration stays near the local example clip band.")
    elif 0.55 <= duration_ratio <= 1.65:
        score += 0.09
        factor_keys.append("duration")
        supporting_factors.append("Duration sits in a nearby clip-length band.")
    else:
        score -= 0.08
        limiting_factors.append("Duration drifts away from the example clip band.")

    speech_difference = abs(
        candidate_summary.speech_density_mean - summary.speech_density_mean
    )
    if speech_difference <= 0.12:
        score += 0.16
        factor_keys.append("speech")
        supporting_factors.append("Speech density tracks the local examples.")
    elif speech_difference <= 0.24:
        score += 0.08
        factor_keys.append("speech")
        supporting_factors.append("Speech density stays in a nearby range.")
    elif speech_difference >= 0.35:
        score -= 0.08
        limiting_factors.append("Speech density diverges from the local examples.")

    energy_difference = abs(candidate_summary.energy_mean - summary.energy_mean)
    if energy_difference <= 0.14:
        score += 0.14
        factor_keys.append("energy")
        supporting_factors.append("Energy level stays close to the local examples.")
    elif energy_difference <= 0.26:
        score += 0.07
        factor_keys.append("energy")
        supporting_factors.append("Energy lands in a nearby range.")
    elif energy_difference >= 0.35:
        score -= 0.08
        limiting_factors.append("Energy level diverges from the local examples.")

    pacing_difference = abs(candidate_summary.pacing_mean - summary.pacing_mean)
    if pacing_difference <= 0.14:
        score += 0.12
        factor_keys.append("pacing")
        supporting_factors.append("Pacing / signal density stays close to the examples.")
    elif pacing_difference <= 0.24:
        score += 0.06
        factor_keys.append("pacing")
        supporting_factors.append("Pacing stays in a nearby band.")
    elif pacing_difference >= 0.32:
        score -= 0.06
        limiting_factors.append("Pacing differs noticeably from the examples.")

    overlap_difference = abs(
        candidate_summary.overlap_activity_mean - summary.overlap_activity_mean
    )
    if overlap_difference <= 0.12:
        score += 0.1
        factor_keys.append("overlap")
        supporting_factors.append("Overlap activity lines up with the examples.")
    elif overlap_difference <= 0.22:
        score += 0.05
        factor_keys.append("overlap")
        supporting_factors.append("Overlap activity is in a nearby range.")

    activity_difference = abs(
        candidate_summary.high_activity_share - summary.high_activity_share
    )
    if activity_difference <= 0.15:
        score += 0.08
        factor_keys.append("activity")
        supporting_factors.append("High-activity share looks similar to the examples.")
    elif activity_difference <= 0.28:
        score += 0.04
        factor_keys.append("activity")
        supporting_factors.append("High-activity share is directionally similar.")

    reason_overlap = [
        reason_code
        for reason_code in candidate_summary.reason_codes
        if reason_code in summary.top_reason_codes
    ]
    if len(reason_overlap) >= 2:
        score += 0.22
        factor_keys.append("reason")
        supporting_factors.append(
            "Reason-code tendencies overlap cleanly with the examples."
        )
    elif len(reason_overlap) == 1:
        score += 0.12
        factor_keys.append("reason")
        supporting_factors.append("At least one key reason-code tendency lines up.")
    elif summary.top_reason_codes:
        score -= 0.08
        limiting_factors.append("Reason-code tendencies do not line up cleanly.")

    phrase_overlap = [
        phrase
        for phrase in candidate_summary.transcript_anchor_phrases
        if phrase in summary.transcript_anchor_phrases
    ]
    term_overlap = [
        term
        for term in candidate_summary.transcript_anchor_terms
        if term in summary.transcript_anchor_terms
    ]
    if phrase_overlap:
        score += 0.1
        factor_keys.append("transcript")
        supporting_factors.append(
            "Transcript anchors overlap explicitly: "
            f"{', '.join(phrase_overlap[:2])}."
        )
    elif len(term_overlap) >= 2:
        score += 0.06
        factor_keys.append("transcript")
        supporting_factors.append(
            "Transcript anchors overlap: "
            f"{', '.join(term_overlap[:3])}."
        )

    if (
        ReviewTag.LOW_INFORMATION_RISK in candidate_summary.review_tags
        and ReasonCode.LOW_INFORMATION not in summary.top_reason_codes
    ):
        score -= 0.08
        limiting_factors.append(
            "This candidate carries more low-information risk than the examples."
        )

    return ExampleComparison(
        example_id=example.id,
        score=max(0.0, min(score, 1.0)),
        factor_keys=factor_keys,
        supporting_factors=supporting_factors,
        limiting_factors=limiting_factors,
    )


def _match_strength(
    score: float,
    *,
    factor_keys: set[str],
    limiting_factor_count: int,
) -> CandidateProfileMatchStrength:
    if (
        score >= 0.74
        and len(factor_keys) >= 4
        and limiting_factor_count == 0
        and ("reason" in factor_keys or {"energy", "pacing"} <= factor_keys)
    ):
        return CandidateProfileMatchStrength.STRONG

    if score >= 0.5 and len(factor_keys) >= 2:
        return CandidateProfileMatchStrength.POSSIBLE

    return CandidateProfileMatchStrength.WEAK


def _match_note(
    strength: CandidateProfileMatchStrength,
    *,
    usable_example_count: int,
    supporting_factors: list[str],
    limiting_factors: list[str],
) -> str:
    if strength == CandidateProfileMatchStrength.STRONG:
        return (
            f"Conservative local-file heuristic match against {usable_example_count} example"
            f"{'' if usable_example_count == 1 else 's'}."
        )

    if strength == CandidateProfileMatchStrength.POSSIBLE:
        return (
            f"Partial local-file heuristic match against {usable_example_count} example"
            f"{'' if usable_example_count == 1 else 's'}."
        )

    if supporting_factors:
        return "Weak local-file heuristic match. Some factors line up, but the evidence is not strong enough to promote."

    if limiting_factors:
        return "Local-file heuristic comparison ran, but it did not find clear alignment with the current examples."

    return "Local-file heuristic comparison ran, but the evidence remains thin."


def _unavailable_match_note(profile: ContentProfile) -> str:
    total_examples = len(profile.example_clips)
    if total_examples == 0:
        return "Add local example clips to turn on profile-aware matching."

    local_example_count = sum(
        1
        for example in profile.example_clips
        if example.source_type
        in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }
    )
    if local_example_count == 0:
        return "This profile only has stored URL/reference examples right now. Matching is local-file-only in this build."

    return "Local examples are saved, but none are currently usable for heuristic matching."


def _high_activity_share(feature_windows: list[FeatureWindow]) -> float:
    if not feature_windows:
        return 0.0

    high_activity_windows = [
        window
        for window in feature_windows
        if window.rms_loudness >= 0.65
        or window.onset_density >= 0.62
        or window.laughter_like_burst >= 0.65
        or window.overlap_activity >= 0.55
        or window.speech_density >= 0.78
    ]
    return len(high_activity_windows) / len(feature_windows)


def _mean(values: list[float], *, fallback: float) -> float:
    if not values:
        return fallback

    return sum(values) / len(values)


def _density_per_minute(item_count: int, duration_seconds: float) -> float:
    normalized_minutes = max(duration_seconds / 60.0, 0.25)
    return item_count / normalized_minutes


def _deduplicate_text(values) -> list[str]:
    deduped: list[str] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return deduped


# Transcript anchor boundary
def _extract_transcript_anchors(
    transcript_texts: list[str],
) -> tuple[list[str], list[str]]:
    token_counts: Counter[str] = Counter()
    phrase_counts: Counter[str] = Counter()

    for text in transcript_texts:
        tokens = [
            token
            for token in re.findall(r"[a-z]{4,}", text.lower())
            if token not in TRANSCRIPT_ANCHOR_STOPWORDS
        ]
        if not tokens:
            continue

        token_counts.update(tokens)
        phrase_counts.update(
            " ".join(pair)
            for pair in zip(tokens, tokens[1:])
            if len(pair) == 2
        )

    ranked_terms = [
        token
        for token, _count in sorted(
            token_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[:6]
    ]
    ranked_phrases = [
        phrase
        for phrase, _count in sorted(
            phrase_counts.items(),
            key=lambda item: (-item[1], item[0]),
        )[:4]
    ]
    return ranked_terms, ranked_phrases
