from __future__ import annotations

from dataclasses import dataclass

from ..contracts import (
    AnalysisCoverage,
    AnalysisCoverageBand,
    CandidateWindow,
    ConfidenceBand,
    FeatureWindow,
    ReasonCode,
    ReviewTag,
    ScoreContribution,
    Settings,
    SpeechRegion,
    SuggestedSegment,
    TimeRange,
    TranscriptChunk,
)

# Scoring taxonomy contract
MENU_TERMS = (
    "menu",
    "inventory",
    "settings",
    "loadout",
    "pause",
    "map",
    "admin",
)

CLEANUP_TERMS = (
    "hold on",
    "give me a second",
    "reset",
    "cleanup",
    "sort this",
    "let me check",
    "back to base",
)


@dataclass
class CandidateSeed:
    start_seconds: float
    end_seconds: float
    transcript_snippet: str
    editable_label: str
    score_breakdown: list[ScoreContribution]
    context_required: bool


def _confidence_band(score_estimate: float) -> ConfidenceBand:
    if score_estimate >= 0.8:
        return ConfidenceBand.HIGH
    if score_estimate >= 0.58:
        return ConfidenceBand.MEDIUM
    if score_estimate >= 0.35:
        return ConfidenceBand.LOW
    return ConfidenceBand.EXPERIMENTAL


# Candidate seed boundary
def generate_candidate_seeds(
    transcript: list[TranscriptChunk],
    speech_regions: list[SpeechRegion],
    feature_windows: list[FeatureWindow],
    settings: Settings,
    media_duration_seconds: float,
) -> list[CandidateSeed]:
    seeds: list[CandidateSeed] = []

    for chunk in transcript:
        lowered = chunk.text.lower()
        overlapping_features = [
            feature
            for feature in feature_windows
            if feature.start_seconds < chunk.end_seconds and feature.end_seconds > chunk.start_seconds
        ]
        overlapping_speech = [
            speech
            for speech in speech_regions
            if speech.start_seconds < chunk.end_seconds and speech.end_seconds > chunk.start_seconds
        ]

        contributions: list[ScoreContribution] = []
        context_required = False

        if "wait wait" in lowered or "no way" in lowered:
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.REACTION_PHRASE,
                    label="Reaction phrase cluster",
                    contribution=0.38,
                    direction="POSITIVE",
                )
            )
        if "here we go" in lowered or "push now" in lowered:
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_SETUP,
                    label="Setup language before action",
                    contribution=0.18,
                    direction="POSITIVE",
                )
            )
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.TACTICAL_NARRATION,
                    label="Tactical framing",
                    contribution=0.24,
                    direction="POSITIVE",
                )
            )
        if "we survived" in lowered:
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_CONSEQUENCE,
                    label="Consequence follows action",
                    contribution=0.22,
                    direction="POSITIVE",
                )
            )
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_RESOLUTION,
                    label="Payoff language",
                    contribution=0.17,
                    direction="POSITIVE",
                )
            )
        if "this might be bad" in lowered:
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_SETUP,
                    label="Promising setup language",
                    contribution=0.18,
                    direction="POSITIVE",
                )
            )
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.CONTEXT_REQUIRED,
                    label="Needs surrounding context",
                    contribution=-0.07,
                    direction="NEGATIVE",
                )
            )
            contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.LOW_INFORMATION,
                    label="Weak supporting signal density",
                    contribution=-0.10,
                    direction="NEGATIVE",
                )
            )
            context_required = True

        if overlapping_features:
            dominant_feature = max(overlapping_features, key=lambda feature: feature.rms_loudness)
            if dominant_feature.rms_loudness >= 0.7:
                contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.LOUDNESS_SPIKE,
                        label="Loudness spike",
                        contribution=0.27,
                        direction="POSITIVE",
                    )
                )
            if dominant_feature.overlap_activity >= 0.58:
                contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.OVERLAP_SPIKE,
                        label="Overlapping speech spike",
                        contribution=0.30,
                        direction="POSITIVE",
                    )
                )
            if dominant_feature.speech_density >= 0.75:
                contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.COMMENTARY_DENSITY,
                        label="Sustained commentary density",
                        contribution=0.23,
                        direction="POSITIVE",
                    )
                )
            if dominant_feature.laughter_like_burst >= 0.7:
                contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.LAUGHTER_BURST,
                        label="Laughter-like burst",
                        contribution=0.27,
                        direction="POSITIVE",
                    )
                )

        if not overlapping_speech and not contributions:
            continue

        start_seconds = max(0.0, chunk.start_seconds - settings.suggested_setup_padding_seconds - 2.0)
        end_seconds = min(
            chunk.end_seconds + settings.suggested_resolution_padding_seconds + 20.0,
            chunk.end_seconds + settings.candidate_window_max_seconds,
            media_duration_seconds,
        )

        seeds.append(
            CandidateSeed(
                start_seconds=start_seconds,
                end_seconds=end_seconds,
                transcript_snippet=chunk.text,
                editable_label=_derive_candidate_label(
                    chunk,
                    contributions,
                    context_required,
                ),
                score_breakdown=_deduplicate_contributions(contributions),
                context_required=context_required,
            )
        )

    return seeds


# Candidate shaping boundary
def shape_candidates(seeds: list[CandidateSeed], settings: Settings) -> list[CandidateWindow]:
    candidates: list[CandidateWindow] = []

    for index, seed in enumerate(seeds, start=1):
        score_estimate = max(
            0.0,
            min(1.0, sum(item.contribution for item in seed.score_breakdown)),
        )
        confidence_band = _confidence_band(score_estimate)
        suggested_start = max(0.0, seed.start_seconds + 6.0)
        suggested_end = max(
            suggested_start + settings.candidate_window_min_seconds,
            min(seed.end_seconds - 6.0, seed.start_seconds + 34.0),
        )

        candidates.append(
            CandidateWindow(
                id=f"candidate_{index:03d}",
                candidate_window=TimeRange(seed.start_seconds, seed.end_seconds),
                suggested_segment=SuggestedSegment(
                    start_seconds=suggested_start,
                    end_seconds=suggested_end,
                    setup_padding_seconds=settings.suggested_setup_padding_seconds,
                    resolution_padding_seconds=settings.suggested_resolution_padding_seconds,
                    trim_dead_air_applied=True if score_estimate >= 0.75 else False,
                ),
                confidence_band=confidence_band,
                score_estimate=round(score_estimate, 2),
                reason_codes=[item.reason_code for item in seed.score_breakdown],
                transcript_snippet=seed.transcript_snippet,
                score_breakdown=seed.score_breakdown,
                context_required=seed.context_required,
                editable_label=seed.editable_label,
                review_tags=[],
            )
        )

    return candidates


# Review filter boundary
def apply_review_post_filter(
    candidates: list[CandidateWindow],
    feature_windows: list[FeatureWindow],
    speech_regions: list[SpeechRegion],
    analysis_coverage: AnalysisCoverage,
) -> list[CandidateWindow]:
    reviewed_candidates: list[CandidateWindow] = []

    for candidate in candidates:
        overlapping_features = [
            feature
            for feature in feature_windows
            if feature.start_seconds < candidate.candidate_window.end_seconds
            and feature.end_seconds > candidate.candidate_window.start_seconds
        ]
        overlapping_speech = [
            speech
            for speech in speech_regions
            if speech.start_seconds < candidate.candidate_window.end_seconds
            and speech.end_seconds > candidate.candidate_window.start_seconds
        ]

        average_rms = _average(
            [feature.rms_loudness for feature in overlapping_features],
            fallback=0.0,
        )
        average_onset = _average(
            [feature.onset_density for feature in overlapping_features],
            fallback=0.0,
        )
        average_speech_density = _average(
            [feature.speech_density for feature in overlapping_features],
            fallback=_average(
                [speech.speech_density for speech in overlapping_speech],
                fallback=0.0,
            ),
        )
        transcript_anchor_score = _transcript_anchor_score(candidate.transcript_snippet)
        audio_activity_score = min(
            1.0,
            average_rms * 0.45 + average_onset * 0.3 + average_speech_density * 0.25,
        )
        positive_reason_count = sum(
            1
            for contribution in candidate.score_breakdown
            if contribution.direction == "POSITIVE"
        )
        lowered = candidate.transcript_snippet.lower()

        extra_contributions: list[ScoreContribution] = []
        coverage_score_penalty = 0.0
        review_tags = list(candidate.review_tags)

        if (
            average_speech_density <= 0.2
            and average_rms <= 0.28
            and average_onset <= 0.24
        ):
            review_tags.append(ReviewTag.DEAD_AIR_RISK)
            extra_contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.LOW_INFORMATION,
                    label="Sparse speech and low-energy window",
                    contribution=-0.14,
                    direction="NEGATIVE",
                )
            )

        if any(term in lowered for term in MENU_TERMS):
            review_tags.append(ReviewTag.MENU_RISK)
            extra_contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.MENU_HEAVY,
                    label="Menu / admin language cue",
                    contribution=-0.12,
                    direction="NEGATIVE",
                )
            )

        if any(term in lowered for term in CLEANUP_TERMS):
            review_tags.append(ReviewTag.CLEANUP_RISK)
            extra_contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.CLEANUP_HEAVY,
                    label="Cleanup / reset pacing risk",
                    contribution=-0.11,
                    direction="NEGATIVE",
                )
            )

        if (
            candidate.context_required
            or positive_reason_count <= 1
            or average_speech_density <= 0.35
        ) and candidate.score_estimate < 0.62:
            review_tags.append(ReviewTag.LOW_INFORMATION_RISK)
            extra_contributions.append(
                ScoreContribution(
                    reason_code=ReasonCode.LOW_INFORMATION,
                    label="Thin standalone payoff signal",
                    contribution=-0.10,
                    direction="NEGATIVE",
                )
            )

        if analysis_coverage.band == AnalysisCoverageBand.THIN and (
            candidate.context_required
            or positive_reason_count <= 2
            or candidate.score_estimate < 0.78
        ):
            review_tags.append(ReviewTag.LOW_INFORMATION_RISK)
            coverage_score_penalty = 0.14
            if not _has_reason_code(
                candidate.score_breakdown + extra_contributions,
                ReasonCode.LOW_INFORMATION,
            ):
                extra_contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.LOW_INFORMATION,
                        label="Thin session coverage; treat as exploratory",
                        contribution=-0.14,
                        direction="NEGATIVE",
                    )
                )
        elif analysis_coverage.band == AnalysisCoverageBand.PARTIAL and (
            candidate.context_required
            or positive_reason_count <= 1
            or candidate.score_estimate < 0.52
        ):
            review_tags.append(ReviewTag.LOW_INFORMATION_RISK)
            coverage_score_penalty = 0.07
            if not _has_reason_code(
                candidate.score_breakdown + extra_contributions,
                ReasonCode.LOW_INFORMATION,
            ):
                extra_contributions.append(
                    ScoreContribution(
                        reason_code=ReasonCode.LOW_INFORMATION,
                        label="Partial coverage; weaker payoff needs skepticism",
                        contribution=-0.07,
                        direction="NEGATIVE",
                    )
                )

        candidate.review_tags = _deduplicate_review_tags(review_tags)
        candidate.quality_signals = {
            "audioActivity": round(audio_activity_score, 3),
            "averageLoudness": round(average_rms, 3),
            "averageOnsetDensity": round(average_onset, 3),
            "speechDensity": round(average_speech_density, 3),
            "transcriptAnchor": round(transcript_anchor_score, 3),
            "positiveReasonCount": float(positive_reason_count),
        }
        if extra_contributions or coverage_score_penalty > 0:
            candidate.score_breakdown = _deduplicate_contributions(
                candidate.score_breakdown + extra_contributions
            )
            candidate.reason_codes = [
                item.reason_code for item in candidate.score_breakdown
            ]
            adjusted_score = max(
                0.0,
                min(
                    1.0,
                    sum(item.contribution for item in candidate.score_breakdown)
                    - coverage_score_penalty,
                ),
            )
            candidate.score_estimate = round(adjusted_score, 2)
            candidate.confidence_band = _confidence_band(adjusted_score)

        reviewed_candidates.append(candidate)

    ranked_candidates = sorted(
        reviewed_candidates,
        key=lambda candidate: (
            -candidate.rank_adjustment,
            -candidate.score_estimate,
            len(candidate.review_tags),
            candidate.candidate_window.start_seconds,
        ),
    )
    _annotate_near_duplicates(ranked_candidates)
    return ranked_candidates


def _deduplicate_contributions(
    contributions: list[ScoreContribution],
) -> list[ScoreContribution]:
    deduped: list[ScoreContribution] = []
    seen = set()

    for contribution in contributions:
        if contribution.reason_code in seen:
            continue
        seen.add(contribution.reason_code)
        deduped.append(contribution)

    return deduped


def _deduplicate_review_tags(review_tags: list[ReviewTag]) -> list[ReviewTag]:
    deduped: list[ReviewTag] = []
    seen = set()

    for review_tag in review_tags:
        if review_tag in seen:
            continue
        seen.add(review_tag)
        deduped.append(review_tag)

    return deduped


def _has_reason_code(
    contributions: list[ScoreContribution],
    reason_code: ReasonCode,
) -> bool:
    return any(contribution.reason_code == reason_code for contribution in contributions)


def _average(values: list[float], *, fallback: float) -> float:
    if not values:
        return fallback

    return sum(values) / len(values)


def _transcript_anchor_score(transcript_snippet: str) -> float:
    lowered = transcript_snippet.lower()
    anchor_terms = (
        "wait",
        "no way",
        "here we go",
        "push",
        "finish",
        "survived",
        "bad",
        "clutch",
        "payoff",
        "setup",
    )
    matches = sum(1 for term in anchor_terms if term in lowered)
    return min(1.0, matches / 4)


def _annotate_near_duplicates(candidates: list[CandidateWindow]) -> None:
    for candidate in candidates:
        candidate.near_duplicate_candidate_ids = []
        candidate.duplicate_of_candidate_id = None

    for index, candidate in enumerate(candidates):
        for other in candidates[index + 1 :]:
            overlap = _time_overlap_ratio(candidate.candidate_window, other.candidate_window)
            transcript_similarity = _transcript_similarity(
                candidate.transcript_snippet,
                other.transcript_snippet,
            )
            if overlap < 0.42 and transcript_similarity < 0.58:
                continue

            candidate.near_duplicate_candidate_ids.append(other.id)
            other.near_duplicate_candidate_ids.append(candidate.id)

            if overlap >= 0.72 or transcript_similarity >= 0.82:
                lower_scoring = (
                    other
                    if candidate.score_estimate >= other.score_estimate
                    else candidate
                )
                higher_scoring = candidate if lower_scoring is other else other
                if lower_scoring.duplicate_of_candidate_id is None:
                    lower_scoring.duplicate_of_candidate_id = higher_scoring.id


def _time_overlap_ratio(left: TimeRange, right: TimeRange) -> float:
    overlap = max(
        0.0,
        min(left.end_seconds, right.end_seconds)
        - max(left.start_seconds, right.start_seconds),
    )
    shortest_duration = max(
        0.001,
        min(
            left.end_seconds - left.start_seconds,
            right.end_seconds - right.start_seconds,
        ),
    )
    return overlap / shortest_duration


def _transcript_similarity(left: str, right: str) -> float:
    left_terms = {
        term.strip(".,!?;:\"'()[]{}").lower()
        for term in left.split()
        if len(term.strip(".,!?;:\"'()[]{}")) >= 4
    }
    right_terms = {
        term.strip(".,!?;:\"'()[]{}").lower()
        for term in right.split()
        if len(term.strip(".,!?;:\"'()[]{}")) >= 4
    }
    if not left_terms or not right_terms:
        return 0.0
    return len(left_terms & right_terms) / len(left_terms | right_terms)


# Candidate label boundary
def _derive_candidate_label(
    chunk: TranscriptChunk,
    contributions: list[ScoreContribution],
    context_required: bool,
) -> str:
    reason_codes = [contribution.reason_code for contribution in contributions]

    if context_required or ReasonCode.CONTEXT_REQUIRED in reason_codes:
        cue = "Context-heavy window"
    elif (
        ReasonCode.STRUCTURE_RESOLUTION in reason_codes
        or ReasonCode.STRUCTURE_CONSEQUENCE in reason_codes
    ) and (
        ReasonCode.OVERLAP_SPIKE in reason_codes
        or ReasonCode.LAUGHTER_BURST in reason_codes
        or ReasonCode.LOUDNESS_SPIKE in reason_codes
    ):
        cue = "Payoff spike"
    elif (
        ReasonCode.STRUCTURE_SETUP in reason_codes
        and ReasonCode.TACTICAL_NARRATION in reason_codes
    ):
        cue = "Setup cue"
    elif ReasonCode.REACTION_PHRASE in reason_codes:
        cue = "Reaction cue"
    elif ReasonCode.OVERLAP_SPIKE in reason_codes:
        cue = "Overlap spike"
    elif ReasonCode.LAUGHTER_BURST in reason_codes:
        cue = "Laughter burst"
    elif ReasonCode.LOUDNESS_SPIKE in reason_codes:
        cue = "Loudness spike"
    elif ReasonCode.COMMENTARY_DENSITY in reason_codes:
        cue = "Commentary cluster"
    else:
        cue = "Exploratory marker"

    return f"{cue} near {_format_short_time(chunk.start_seconds)}"


def _format_short_time(seconds: float) -> str:
    whole_seconds = max(0, int(round(seconds)))
    hours, remainder = divmod(whole_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"
