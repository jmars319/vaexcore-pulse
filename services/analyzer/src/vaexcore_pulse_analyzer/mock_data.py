from __future__ import annotations

from datetime import datetime, timezone

from .contracts import (
    AnalysisCoverage,
    AnalysisCoverageBand,
    AnalysisCoverageFlag,
    AnalysisProvenance,
    AnalysisProvenanceState,
    CandidateWindow,
    ConfidenceBand,
    FeatureWindow,
    MediaSource,
    ProjectSession,
    ReasonCode,
    ReviewTag,
    ScoreContribution,
    Settings,
    SpeechRegion,
    SuggestedSegment,
    TimeRange,
    TranscriptChunk,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_mock_media_source(path: str | None = None) -> MediaSource:
    source_path = path or "/Users/jason_marshall/VODs/raid-night-2026-03-07.mkv"
    return MediaSource(
        id="media_demo_001",
        path=source_path,
        kind="VIDEO",
        file_name=source_path.split("/")[-1],
        duration_seconds=8342.0,
        format=source_path.split(".")[-1],
        file_size_bytes=18_723_498_765,
        frame_rate=60.0,
        ingest_notes=[
            "Demo ingest fixture used for the mock session path.",
            "Real local runs use ffprobe when available and stay offline-only.",
        ],
    )


def build_mock_transcript() -> list[TranscriptChunk]:
    return [
        TranscriptChunk(
            id="chunk_001",
            start_seconds=318.0,
            end_seconds=322.0,
            text="Seeded local anchor near 00:05:20",
            confidence=0.0,
        ),
        TranscriptChunk(
            id="chunk_002",
            start_seconds=1458.0,
            end_seconds=1462.0,
            text="Seeded local anchor near 00:24:20",
            confidence=0.0,
        ),
        TranscriptChunk(
            id="chunk_003",
            start_seconds=4240.0,
            end_seconds=4244.0,
            text="Seeded local anchor near 01:10:42",
            confidence=0.0,
        ),
        TranscriptChunk(
            id="chunk_004",
            start_seconds=6112.0,
            end_seconds=6117.0,
            text="Seeded local anchor near 01:41:56",
            confidence=0.0,
        ),
    ]


def build_mock_speech_regions() -> list[SpeechRegion]:
    return [
        SpeechRegion(
            id="speech_001",
            start_seconds=314.0,
            end_seconds=329.0,
            speech_density=0.86,
            overlap_activity=0.22,
        ),
        SpeechRegion(
            id="speech_002",
            start_seconds=1453.0,
            end_seconds=1469.0,
            speech_density=0.78,
            overlap_activity=0.58,
        ),
        SpeechRegion(
            id="speech_003",
            start_seconds=4238.0,
            end_seconds=4251.0,
            speech_density=0.90,
            overlap_activity=0.67,
        ),
        SpeechRegion(
            id="speech_004",
            start_seconds=6108.0,
            end_seconds=6123.0,
            speech_density=0.55,
            overlap_activity=0.12,
        ),
    ]


def build_mock_feature_windows() -> list[FeatureWindow]:
    return [
        FeatureWindow(
            id="feature_001",
            start_seconds=316.0,
            end_seconds=318.0,
            rms_loudness=0.8,
            onset_density=0.76,
            spectral_contrast=0.72,
            zero_crossing_rate=0.42,
            speech_density=0.84,
            overlap_activity=0.28,
            laughter_like_burst=0.18,
            pitch_excursion=0.70,
            abrupt_silence_after_intensity=0.55,
        ),
        FeatureWindow(
            id="feature_002",
            start_seconds=1458.0,
            end_seconds=1460.0,
            rms_loudness=0.71,
            onset_density=0.68,
            spectral_contrast=0.63,
            zero_crossing_rate=0.36,
            speech_density=0.78,
            overlap_activity=0.60,
            laughter_like_burst=0.10,
            pitch_excursion=0.51,
            abrupt_silence_after_intensity=0.22,
        ),
        FeatureWindow(
            id="feature_003",
            start_seconds=4240.0,
            end_seconds=4242.0,
            rms_loudness=0.83,
            onset_density=0.71,
            spectral_contrast=0.77,
            zero_crossing_rate=0.41,
            speech_density=0.90,
            overlap_activity=0.67,
            laughter_like_burst=0.74,
            pitch_excursion=0.62,
            abrupt_silence_after_intensity=0.49,
        ),
        FeatureWindow(
            id="feature_004",
            start_seconds=6112.0,
            end_seconds=6114.0,
            rms_loudness=0.42,
            onset_density=0.33,
            spectral_contrast=0.46,
            zero_crossing_rate=0.22,
            speech_density=0.54,
            overlap_activity=0.12,
            laughter_like_burst=0.02,
            pitch_excursion=0.39,
            abrupt_silence_after_intensity=0.05,
        ),
    ]


def build_mock_candidates() -> list[CandidateWindow]:
    return [
        CandidateWindow(
            id="candidate_001",
            candidate_window=TimeRange(310.0, 350.0),
            suggested_segment=SuggestedSegment(
                start_seconds=316.0,
                end_seconds=344.0,
                setup_padding_seconds=6.0,
                resolution_padding_seconds=8.0,
                trim_dead_air_applied=True,
            ),
            confidence_band=ConfidenceBand.HIGH,
            score_estimate=0.91,
            reason_codes=[
                ReasonCode.REACTION_PHRASE,
                ReasonCode.LOUDNESS_SPIKE,
                ReasonCode.STRUCTURE_RESOLUTION,
            ],
            transcript_snippet="Seeded local anchor near 00:05:20",
            score_breakdown=[
                ScoreContribution(
                    reason_code=ReasonCode.REACTION_PHRASE,
                    label="Reaction phrase cluster",
                    contribution=0.38,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.LOUDNESS_SPIKE,
                    label="Loudness spike",
                    contribution=0.27,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_RESOLUTION,
                    label="Clear consequence / payoff",
                    contribution=0.26,
                    direction="POSITIVE",
                ),
            ],
            context_required=False,
            editable_label="Reaction cue near 00:05:18",
        ),
        CandidateWindow(
            id="candidate_002",
            candidate_window=TimeRange(1448.0, 1486.0),
            suggested_segment=SuggestedSegment(
                start_seconds=1454.0,
                end_seconds=1479.0,
                setup_padding_seconds=6.0,
                resolution_padding_seconds=8.0,
                trim_dead_air_applied=False,
            ),
            confidence_band=ConfidenceBand.MEDIUM,
            score_estimate=0.70,
            reason_codes=[
                ReasonCode.TACTICAL_NARRATION,
                ReasonCode.COMMENTARY_DENSITY,
                ReasonCode.STRUCTURE_SETUP,
            ],
            transcript_snippet="Seeded local anchor near 00:24:20",
            score_breakdown=[
                ScoreContribution(
                    reason_code=ReasonCode.TACTICAL_NARRATION,
                    label="Tactical framing",
                    contribution=0.24,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.COMMENTARY_DENSITY,
                    label="Sustained commentary density",
                    contribution=0.23,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_SETUP,
                    label="Setup language before action",
                    contribution=0.18,
                    direction="POSITIVE",
                ),
            ],
            context_required=False,
            editable_label="Setup cue near 00:24:08",
        ),
        CandidateWindow(
            id="candidate_003",
            candidate_window=TimeRange(4234.0, 4258.0),
            suggested_segment=SuggestedSegment(
                start_seconds=4238.0,
                end_seconds=4251.0,
                setup_padding_seconds=4.0,
                resolution_padding_seconds=7.0,
                trim_dead_air_applied=True,
            ),
            confidence_band=ConfidenceBand.HIGH,
            score_estimate=0.88,
            reason_codes=[
                ReasonCode.OVERLAP_SPIKE,
                ReasonCode.LAUGHTER_BURST,
                ReasonCode.STRUCTURE_CONSEQUENCE,
            ],
            transcript_snippet="Seeded local anchor near 01:10:42",
            score_breakdown=[
                ScoreContribution(
                    reason_code=ReasonCode.OVERLAP_SPIKE,
                    label="Overlapping speech spike",
                    contribution=0.30,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.LAUGHTER_BURST,
                    label="Laughter-like burst",
                    contribution=0.27,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_CONSEQUENCE,
                    label="Consequence follows action",
                    contribution=0.22,
                    direction="POSITIVE",
                ),
            ],
            context_required=False,
            editable_label="Payoff spike near 01:10:34",
        ),
        CandidateWindow(
            id="candidate_004",
            candidate_window=TimeRange(6104.0, 6136.0),
            suggested_segment=SuggestedSegment(
                start_seconds=6110.0,
                end_seconds=6124.0,
                setup_padding_seconds=6.0,
                resolution_padding_seconds=6.0,
                trim_dead_air_applied=False,
            ),
            confidence_band=ConfidenceBand.EXPERIMENTAL,
            score_estimate=0.41,
            reason_codes=[
                ReasonCode.CONTEXT_REQUIRED,
                ReasonCode.STRUCTURE_SETUP,
                ReasonCode.LOW_INFORMATION,
            ],
            transcript_snippet="Seeded local anchor near 01:41:56",
            score_breakdown=[
                ScoreContribution(
                    reason_code=ReasonCode.STRUCTURE_SETUP,
                    label="Promising setup language",
                    contribution=0.18,
                    direction="POSITIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.CONTEXT_REQUIRED,
                    label="Needs surrounding context",
                    contribution=-0.07,
                    direction="NEGATIVE",
                ),
                ScoreContribution(
                    reason_code=ReasonCode.LOW_INFORMATION,
                    label="Weak supporting signal density",
                    contribution=-0.10,
                    direction="NEGATIVE",
                ),
            ],
            context_required=True,
            editable_label="Context-heavy window near 01:41:44",
            review_tags=[ReviewTag.LOW_INFORMATION_RISK],
        ),
    ]


def build_mock_session(settings: Settings) -> ProjectSession:
    now = _now_iso()
    return ProjectSession(
        id="session_demo_local",
        title="Raid Night Demo Review",
        status="REVIEWING",
        media_source=build_mock_media_source(),
        profile_id="generic",
        settings=settings,
        transcript=build_mock_transcript(),
        speech_regions=build_mock_speech_regions(),
        feature_windows=build_mock_feature_windows(),
        candidates=build_mock_candidates(),
        review_decisions=[],
        created_at=now,
        updated_at=now,
        analysis_coverage=AnalysisCoverage(
            band=AnalysisCoverageBand.PARTIAL,
            note=(
                "Partial coverage: demo data is curated, but transcript anchors still "
                "represent the current heuristic pipeline rather than real STT coverage."
            ),
            flags=[AnalysisCoverageFlag.SEEDED_TRANSCRIPT],
        ),
        analysis_provenance=AnalysisProvenance(
            state=AnalysisProvenanceState.MOCK,
            transcript_source="mock",
            audio_signal_source="mock",
            notes=["Deterministic mock session used for tests and demos."],
        ),
    )
