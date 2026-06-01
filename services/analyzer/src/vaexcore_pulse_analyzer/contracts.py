from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class ConfidenceBand(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    EXPERIMENTAL = "EXPERIMENTAL"


class ReasonCode(str, Enum):
    LOUDNESS_SPIKE = "LOUDNESS_SPIKE"
    LAUGHTER_BURST = "LAUGHTER_BURST"
    OVERLAP_SPIKE = "OVERLAP_SPIKE"
    REACTION_PHRASE = "REACTION_PHRASE"
    COMMENTARY_DENSITY = "COMMENTARY_DENSITY"
    SILENCE_BREAK = "SILENCE_BREAK"
    ACTION_AUDIO_CLUSTER = "ACTION_AUDIO_CLUSTER"
    STRUCTURE_SETUP = "STRUCTURE_SETUP"
    STRUCTURE_CONSEQUENCE = "STRUCTURE_CONSEQUENCE"
    STRUCTURE_RESOLUTION = "STRUCTURE_RESOLUTION"
    MENU_HEAVY = "MENU_HEAVY"
    CLEANUP_HEAVY = "CLEANUP_HEAVY"
    LOW_INFORMATION = "LOW_INFORMATION"
    CONTEXT_REQUIRED = "CONTEXT_REQUIRED"
    TACTICAL_NARRATION = "TACTICAL_NARRATION"
    PITCH_EXCURSION = "PITCH_EXCURSION"
    ABRUPT_SILENCE_AFTER_INTENSITY = "ABRUPT_SILENCE_AFTER_INTENSITY"


class ReviewAction(str, Enum):
    PENDING = "PENDING"
    ACCEPT = "ACCEPT"
    REJECT = "REJECT"
    RETIME = "RETIME"
    RELABEL = "RELABEL"


class ReviewTag(str, Enum):
    DEAD_AIR_RISK = "DEAD_AIR_RISK"
    CLEANUP_RISK = "CLEANUP_RISK"
    MENU_RISK = "MENU_RISK"
    LOW_INFORMATION_RISK = "LOW_INFORMATION_RISK"


class AnalysisCoverageBand(str, Enum):
    STRONG = "STRONG"
    PARTIAL = "PARTIAL"
    THIN = "THIN"


class AnalysisCoverageFlag(str, Enum):
    METADATA_FALLBACK_USED = "METADATA_FALLBACK_USED"
    SEEDED_TRANSCRIPT = "SEEDED_TRANSCRIPT"
    TRANSCRIPT_SPARSE = "TRANSCRIPT_SPARSE"
    LOW_CANDIDATE_COUNT = "LOW_CANDIDATE_COUNT"
    NO_CANDIDATES = "NO_CANDIDATES"


class ExampleClipSourceType(str, Enum):
    TWITCH_CLIP_URL = "TWITCH_CLIP_URL"
    YOUTUBE_SHORT_URL = "YOUTUBE_SHORT_URL"
    LOCAL_FILE_UPLOAD = "LOCAL_FILE_UPLOAD"
    LOCAL_FILE_PATH = "LOCAL_FILE_PATH"


class ExampleReferenceKind(str, Enum):
    CLIP = "CLIP"
    PROFILE_EDIT = "PROFILE_EDIT"


class ExampleClipStatus(str, Enum):
    REFERENCE_ONLY = "REFERENCE_ONLY"
    LOCAL_FILE_AVAILABLE = "LOCAL_FILE_AVAILABLE"
    MISSING_LOCAL_FILE = "MISSING_LOCAL_FILE"


class MediaLibraryAssetType(str, Enum):
    CLIP = "CLIP"
    VOD = "VOD"
    EDIT = "EDIT"


class MediaLibraryAssetScope(str, Enum):
    GLOBAL = "GLOBAL"
    PROFILE = "PROFILE"


class MediaEditPairStatus(str, Enum):
    READY = "READY"
    INCOMPLETE = "INCOMPLETE"


class MediaIndexJobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MediaIndexArtifactKind(str, Enum):
    AUDIO_FINGERPRINT = "AUDIO_FINGERPRINT"
    THUMBNAIL_SUGGESTIONS = "THUMBNAIL_SUGGESTIONS"


class MediaIndexArtifactMethod(str, Enum):
    BYTE_SAMPLED_AUDIO_PROXY_V1 = "BYTE_SAMPLED_AUDIO_PROXY_V1"
    DECODED_AUDIO_FINGERPRINT_V1 = "DECODED_AUDIO_FINGERPRINT_V1"
    FFMPEG_TIMELINE_THUMBNAILS_V1 = "FFMPEG_TIMELINE_THUMBNAILS_V1"


class MediaAlignmentJobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MediaAlignmentMethod(str, Enum):
    AUDIO_PROXY_BUCKET_CORRELATION_V1 = "AUDIO_PROXY_BUCKET_CORRELATION_V1"
    DECODED_AUDIO_BUCKET_CORRELATION_V1 = "DECODED_AUDIO_BUCKET_CORRELATION_V1"


class MediaAlignmentMatchKind(str, Enum):
    EDIT_TO_VOD_KEEP = "EDIT_TO_VOD_KEEP"
    CLIP_TO_VOD_MATCH = "CLIP_TO_VOD_MATCH"


class MediaEditAlignmentKind(str, Enum):
    PROVISIONAL_KEEP = "PROVISIONAL_KEEP"
    PROVISIONAL_REMOVED_POOL = "PROVISIONAL_REMOVED_POOL"
    CONFIRMED_KEEP = "CONFIRMED_KEEP"
    CONFIRMED_REMOVED = "CONFIRMED_REMOVED"


class MediaEditAlignmentMethod(str, Enum):
    RUNTIME_PROPORTIONAL_ESTIMATE = "RUNTIME_PROPORTIONAL_ESTIMATE"
    AUDIO_PROXY_ALIGNMENT = "AUDIO_PROXY_ALIGNMENT"
    DECODED_AUDIO_ALIGNMENT = "DECODED_AUDIO_ALIGNMENT"
    MANUAL = "MANUAL"


class ProfileMatchingMethod(str, Enum):
    NONE = "NONE"
    LOCAL_FILE_HEURISTIC = "LOCAL_FILE_HEURISTIC"


class CandidateProfileMatchStatus(str, Enum):
    UNASSESSED = "UNASSESSED"
    PLACEHOLDER = "PLACEHOLDER"
    HEURISTIC = "HEURISTIC"
    EXAMPLE_COMPARISON = "EXAMPLE_COMPARISON"


class CandidateProfileMatchStrength(str, Enum):
    UNASSESSED = "UNASSESSED"
    STRONG = "STRONG"
    POSSIBLE = "POSSIBLE"
    WEAK = "WEAK"


@dataclass
class TimeRange:
    start_seconds: float
    end_seconds: float


@dataclass
class MediaSource:
    id: str
    path: str
    kind: str
    file_name: str
    duration_seconds: float
    format: str
    file_size_bytes: int = 0
    frame_rate: Optional[float] = None
    ingest_notes: List[str] = field(default_factory=list)


@dataclass
class TranscriptChunk:
    id: str
    start_seconds: float
    end_seconds: float
    text: str
    confidence: Optional[float] = None


@dataclass
class SpeechRegion:
    id: str
    start_seconds: float
    end_seconds: float
    speech_density: float
    overlap_activity: float


@dataclass
class FeatureWindow:
    id: str
    start_seconds: float
    end_seconds: float
    rms_loudness: float
    onset_density: float
    spectral_contrast: float
    zero_crossing_rate: float
    speech_density: float
    overlap_activity: float
    laughter_like_burst: float
    pitch_excursion: float
    abrupt_silence_after_intensity: float


@dataclass
class ScoreContribution:
    reason_code: ReasonCode
    label: str
    contribution: float
    direction: str


@dataclass
class SuggestedSegment:
    start_seconds: float
    end_seconds: float
    setup_padding_seconds: float
    resolution_padding_seconds: float
    trim_dead_air_applied: bool


@dataclass
class CandidateWindow:
    id: str
    candidate_window: TimeRange
    suggested_segment: SuggestedSegment
    confidence_band: ConfidenceBand
    score_estimate: float
    reason_codes: List[ReasonCode]
    transcript_snippet: str
    score_breakdown: List[ScoreContribution]
    context_required: bool
    editable_label: str
    review_tags: List[ReviewTag] = field(default_factory=list)
    profile_matches: List["CandidateProfileMatch"] = field(default_factory=list)


@dataclass
class AnalysisCoverage:
    band: AnalysisCoverageBand = AnalysisCoverageBand.PARTIAL
    note: str = "Coverage note unavailable for this session."
    flags: List[AnalysisCoverageFlag] = field(default_factory=list)


@dataclass
class ReviewDecision:
    id: str
    project_session_id: str
    candidate_id: str
    action: ReviewAction
    label: Optional[str] = None
    adjusted_segment: Optional[TimeRange] = None
    notes: Optional[str] = None
    created_at: str = ""


@dataclass
class ExampleClipFeatureSummary:
    method_version: str
    generated_at: str
    duration_seconds: float
    transcript_chunk_count: int
    transcript_density_per_minute: float
    candidate_seed_count: int
    candidate_density_per_minute: float
    speech_density_mean: float
    speech_density_peak: float
    energy_mean: float
    energy_peak: float
    pacing_mean: float
    overlap_activity_mean: float
    high_activity_share: float
    transcript_anchor_terms: List[str] = field(default_factory=list)
    transcript_anchor_phrases: List[str] = field(default_factory=list)
    top_reason_codes: List[ReasonCode] = field(default_factory=list)
    coverage_band: AnalysisCoverageBand = AnalysisCoverageBand.PARTIAL
    coverage_flags: List[AnalysisCoverageFlag] = field(default_factory=list)


@dataclass
class MediaIndexSummary:
    method_version: str
    generated_at: str
    source_path: str
    file_name: str
    file_size_bytes: int
    kind: str
    format: str
    duration_seconds: float
    has_video: bool
    has_audio: bool
    stream_count: int
    frame_rate: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    video_codec: Optional[str] = None
    audio_codec: Optional[str] = None
    notes: List[str] = field(default_factory=list)


@dataclass
class MediaIndexAudioBucket:
    index: int
    start_seconds: float
    end_seconds: float
    energy_score: float
    onset_score: float
    spectral_flux_score: float
    silence_score: float
    fingerprint: str


@dataclass
class MediaThumbnailSuggestion:
    id: str
    image_path: str
    timestamp_seconds: float
    score: float
    activity_score: float
    brightness_score: float
    contrast_score: float
    sharpness_score: float
    note: str


@dataclass
class MediaThumbnailSuggestionSet:
    method_version: str
    generated_at: str
    source_path: str
    sample_window_count: int
    note: str
    suggestions: List[MediaThumbnailSuggestion] = field(default_factory=list)


@dataclass
class MediaThumbnailOutput:
    id: str
    asset_id: str
    source_suggestion_id: str
    image_path: str
    timestamp_seconds: float
    score: float
    activity_score: float
    brightness_score: float
    contrast_score: float
    sharpness_score: float
    note: str
    position: int
    selected_at: str


@dataclass
class MediaThumbnailOutputSet:
    updated_at: str
    outputs: List[MediaThumbnailOutput] = field(default_factory=list)


@dataclass
class MediaIndexArtifactSummary:
    latest_audio_fingerprint_artifact_id: Optional[str] = None
    audio_fingerprint_bucket_count: int = 0
    audio_fingerprint_method: Optional[MediaIndexArtifactMethod] = None
    audio_fingerprint_updated_at: Optional[str] = None
    latest_thumbnail_suggestion_artifact_id: Optional[str] = None
    thumbnail_suggestion_count: int = 0
    thumbnail_suggestion_method: Optional[MediaIndexArtifactMethod] = None
    thumbnail_suggestion_updated_at: Optional[str] = None
    bucket_duration_seconds: Optional[float] = None
    confidence_score: Optional[float] = None


@dataclass
class MediaIndexArtifact:
    id: str
    asset_id: str
    kind: MediaIndexArtifactKind
    method: MediaIndexArtifactMethod
    bucket_duration_seconds: float
    duration_seconds: float
    bucket_count: int
    confidence_score: float
    payload_byte_size: int
    note: str
    energy_mean: Optional[float] = None
    energy_peak: Optional[float] = None
    onset_mean: Optional[float] = None
    silence_share: Optional[float] = None
    sample_window_count: Optional[int] = None
    buckets: List[MediaIndexAudioBucket] = field(default_factory=list)
    thumbnail_suggestions: List[MediaThumbnailSuggestion] = field(default_factory=list)
    job_id: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


@dataclass
class ExampleClip:
    id: str
    profile_id: str
    source_type: ExampleClipSourceType
    source_value: str
    reference_kind: ExampleReferenceKind = ExampleReferenceKind.CLIP
    title: Optional[str] = None
    note: Optional[str] = None
    status: ExampleClipStatus = ExampleClipStatus.REFERENCE_ONLY
    status_detail: Optional[str] = None
    feature_summary: Optional[ExampleClipFeatureSummary] = None
    created_at: str = ""
    updated_at: str = ""


@dataclass
class MediaLibraryAsset:
    id: str
    asset_type: MediaLibraryAssetType
    scope: MediaLibraryAssetScope
    source_type: ExampleClipSourceType
    source_value: str
    profile_id: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    status: ExampleClipStatus = ExampleClipStatus.REFERENCE_ONLY
    status_detail: Optional[str] = None
    feature_summary: Optional[ExampleClipFeatureSummary] = None
    index_summary: Optional[MediaIndexSummary] = None
    index_artifact_summary: Optional[MediaIndexArtifactSummary] = None
    thumbnail_suggestion_set: Optional[MediaThumbnailSuggestionSet] = None
    thumbnail_output_set: Optional[MediaThumbnailOutputSet] = None
    created_at: str = ""
    updated_at: str = ""


@dataclass
class MediaIndexJob:
    id: str
    asset_id: str
    status: MediaIndexJobStatus
    progress: float
    status_detail: str
    error_message: Optional[str] = None
    result: Optional[MediaIndexSummary] = None
    created_at: str = ""
    updated_at: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    cancelled_at: Optional[str] = None


@dataclass
class MediaAlignmentBucketMatch:
    query_bucket_index: int
    source_bucket_index: int
    score: float


@dataclass
class MediaAlignmentMatch:
    id: str
    job_id: str
    source_asset_id: str
    query_asset_id: str
    kind: MediaAlignmentMatchKind
    method: MediaAlignmentMethod
    source_range: TimeRange
    query_range: TimeRange
    score: float
    confidence_score: float
    matched_bucket_count: int
    total_query_bucket_count: int
    note: str
    pair_id: Optional[str] = None
    bucket_matches: List[MediaAlignmentBucketMatch] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


@dataclass
class MediaAlignmentJob:
    id: str
    source_asset_id: str
    query_asset_id: str
    status: MediaAlignmentJobStatus
    progress: float
    status_detail: str
    method: MediaAlignmentMethod
    pair_id: Optional[str] = None
    error_message: Optional[str] = None
    match_count: int = 0
    created_at: str = ""
    updated_at: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    cancelled_at: Optional[str] = None


@dataclass
class MediaEditAlignmentSegment:
    id: str
    kind: MediaEditAlignmentKind
    method: MediaEditAlignmentMethod
    confidence_score: float
    note: str
    source_range: Optional[TimeRange] = None
    edit_range: Optional[TimeRange] = None
    estimated_source_seconds: Optional[float] = None
    estimated_edit_seconds: Optional[float] = None


@dataclass
class MediaEditPair:
    id: str
    vod_asset_id: str
    edit_asset_id: str
    status: MediaEditPairStatus
    status_detail: str
    profile_id: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    source_duration_seconds: Optional[float] = None
    edit_duration_seconds: Optional[float] = None
    kept_duration_seconds: Optional[float] = None
    removed_duration_seconds: Optional[float] = None
    keep_ratio: Optional[float] = None
    compression_ratio: Optional[float] = None
    alignment_segments: List[MediaEditAlignmentSegment] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


@dataclass
class CandidateProfileMatch:
    profile_id: str
    method: ProfileMatchingMethod
    status: CandidateProfileMatchStatus
    strength: CandidateProfileMatchStrength
    note: str
    matched_example_clip_ids: List[str] = field(default_factory=list)
    compared_example_count: int = 0
    supporting_factors: List[str] = field(default_factory=list)
    limiting_factors: List[str] = field(default_factory=list)
    similarity_score: Optional[float] = None
    updated_at: Optional[str] = None


@dataclass
class ContentProfile:
    id: str
    name: str
    label: str
    description: str = ""
    created_at: str = ""
    updated_at: str = ""
    state: str = "ACTIVE"
    source: str = "USER"
    mode: str = "EXAMPLE_DRIVEN"
    signal_weights: Dict[ReasonCode, float] = field(default_factory=dict)
    example_clips: List[ExampleClip] = field(default_factory=list)


@dataclass
class Settings:
    micro_window_seconds: float = 2.0
    candidate_window_min_seconds: float = 15.0
    candidate_window_max_seconds: float = 45.0
    suggested_setup_padding_seconds: float = 6.0
    suggested_resolution_padding_seconds: float = 8.0
    experimental_candidate_quota: int = 2
    transcript_provider: str = "auto-local"
    run_offline_only: bool = True
    use_mock_data: bool = False


@dataclass
class ProjectSession:
    id: str
    title: str
    status: str
    media_source: MediaSource
    profile_id: str
    settings: Settings
    transcript: List[TranscriptChunk]
    speech_regions: List[SpeechRegion]
    feature_windows: List[FeatureWindow]
    candidates: List[CandidateWindow]
    review_decisions: List[ReviewDecision]
    created_at: str
    updated_at: str
    analysis_coverage: AnalysisCoverage = field(default_factory=AnalysisCoverage)
