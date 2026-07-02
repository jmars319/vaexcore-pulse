from __future__ import annotations

import json
import re
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from ..contracts import (
    AnalysisCoverage,
    AnalysisCoverageBand,
    AnalysisCoverageFlag,
    AnalysisProvenance,
    AnalysisProvenanceState,
    CandidateEditRecord,
    CandidateProfileMatch,
    CandidateProfileMatchStatus,
    CandidateProfileMatchStrength,
    CandidateWindow,
    ConfidenceBand,
    ContentProfile,
    ExampleClip,
    ExampleClipFeatureSummary,
    ExampleReferenceKind,
    ExampleClipSourceType,
    ExampleClipStatus,
    FeatureWindow,
    MediaAlignmentBucketMatch,
    MediaAlignmentJob,
    MediaAlignmentJobStatus,
    MediaAlignmentMatch,
    MediaAlignmentMatchKind,
    MediaAlignmentMethod,
    MediaEditAlignmentKind,
    MediaEditAlignmentMethod,
    MediaEditAlignmentSegment,
    MediaEditPair,
    MediaEditPairStatus,
    MediaIndexArtifact,
    MediaIndexArtifactKind,
    MediaIndexArtifactMethod,
    MediaIndexArtifactSummary,
    MediaIndexAudioBucket,
    MediaIndexJob,
    MediaIndexJobStatus,
    MediaIndexSummary,
    MediaThumbnailOutput,
    MediaThumbnailOutputSet,
    MediaThumbnailSuggestion,
    MediaThumbnailSuggestionSet,
    MediaLibraryAsset,
    MediaLibraryAssetScope,
    MediaLibraryAssetType,
    MediaSource,
    ProfileMatchingMethod,
    ProjectSession,
    ReasonCode,
    ReviewTag,
    ReviewAction,
    ReviewDecision,
    ScoreContribution,
    Settings,
    SpeechRegion,
    SuggestedSegment,
    TimeRange,
    TranscriptChunk,
)
from ..pipeline.coverage import build_analysis_coverage
from ..pipeline.orchestrator import analyze_media
from ..pipeline.profile_matching import (
    LOCAL_FILE_HEURISTIC_VERSION,
    build_local_example_feature_summary,
)

# SQLite schema contract
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS project_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  media_path TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  session_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_windows (
  id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  confidence_band TEXT NOT NULL,
  transcript_snippet TEXT NOT NULL,
  candidate_window_json TEXT NOT NULL,
  suggested_segment_json TEXT NOT NULL,
  score_breakdown_json TEXT NOT NULL,
  FOREIGN KEY (project_session_id) REFERENCES project_sessions(id)
);

CREATE TABLE IF NOT EXISTS review_decisions (
  id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  action TEXT NOT NULL,
  label TEXT,
  adjusted_segment_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_session_id) REFERENCES project_sessions(id)
);

CREATE TABLE IF NOT EXISTS analysis_artifacts (
  project_session_id TEXT PRIMARY KEY,
  transcript_json TEXT NOT NULL,
  speech_regions_json TEXT NOT NULL,
  feature_windows_json TEXT NOT NULL,
  FOREIGN KEY (project_session_id) REFERENCES project_sessions(id)
);

CREATE TABLE IF NOT EXISTS clip_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  state TEXT NOT NULL,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  signal_weights_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS example_clips (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_value TEXT NOT NULL,
  title TEXT,
  note TEXT,
  status TEXT NOT NULL,
  status_detail TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES clip_profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS review_decisions_session_candidate_idx
ON review_decisions(project_session_id, candidate_id);

CREATE INDEX IF NOT EXISTS example_clips_profile_idx
ON example_clips(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_library_assets (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  profile_id TEXT,
  source_type TEXT NOT NULL,
  source_value TEXT NOT NULL,
  title TEXT,
  note TEXT,
  status TEXT NOT NULL,
  status_detail TEXT,
  summary_json TEXT,
  index_summary_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES clip_profiles(id)
);

CREATE TABLE IF NOT EXISTS media_index_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL,
  status_detail TEXT NOT NULL,
  error_message TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (asset_id) REFERENCES media_library_assets(id)
);

CREATE TABLE IF NOT EXISTS media_index_artifacts (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  job_id TEXT,
  kind TEXT NOT NULL,
  method TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES media_library_assets(id),
  FOREIGN KEY (job_id) REFERENCES media_index_jobs(id)
);

CREATE TABLE IF NOT EXISTS media_thumbnail_outputs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  source_suggestion_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES media_library_assets(id)
);

CREATE TABLE IF NOT EXISTS media_edit_pairs (
  id TEXT PRIMARY KEY,
  vod_asset_id TEXT NOT NULL,
  edit_asset_id TEXT NOT NULL,
  profile_id TEXT,
  title TEXT,
  note TEXT,
  status TEXT NOT NULL,
  status_detail TEXT NOT NULL,
  summary_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vod_asset_id) REFERENCES media_library_assets(id),
  FOREIGN KEY (edit_asset_id) REFERENCES media_library_assets(id),
  FOREIGN KEY (profile_id) REFERENCES clip_profiles(id)
);

CREATE INDEX IF NOT EXISTS media_library_assets_scope_idx
ON media_library_assets(scope, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_library_assets_profile_idx
ON media_library_assets(profile_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_index_jobs_asset_idx
ON media_index_jobs(asset_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_index_jobs_status_idx
ON media_index_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_index_artifacts_asset_idx
ON media_index_artifacts(asset_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_thumbnail_outputs_asset_idx
ON media_thumbnail_outputs(asset_id, position ASC, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_alignment_jobs (
  id TEXT PRIMARY KEY,
  pair_id TEXT,
  source_asset_id TEXT NOT NULL,
  query_asset_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL,
  status_detail TEXT NOT NULL,
  error_message TEXT,
  method TEXT NOT NULL,
  match_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (pair_id) REFERENCES media_edit_pairs(id),
  FOREIGN KEY (source_asset_id) REFERENCES media_library_assets(id),
  FOREIGN KEY (query_asset_id) REFERENCES media_library_assets(id)
);

CREATE TABLE IF NOT EXISTS media_alignment_matches (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  pair_id TEXT,
  source_asset_id TEXT NOT NULL,
  query_asset_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  method TEXT NOT NULL,
  source_range_json TEXT NOT NULL,
  query_range_json TEXT NOT NULL,
  score REAL NOT NULL,
  confidence_score REAL NOT NULL,
  matched_bucket_count INTEGER NOT NULL,
  total_query_bucket_count INTEGER NOT NULL,
  bucket_matches_json TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES media_alignment_jobs(id),
  FOREIGN KEY (pair_id) REFERENCES media_edit_pairs(id),
  FOREIGN KEY (source_asset_id) REFERENCES media_library_assets(id),
  FOREIGN KEY (query_asset_id) REFERENCES media_library_assets(id)
);

CREATE INDEX IF NOT EXISTS media_alignment_jobs_pair_idx
ON media_alignment_jobs(pair_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_alignment_jobs_status_idx
ON media_alignment_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_alignment_matches_pair_idx
ON media_alignment_matches(pair_id, confidence_score DESC);

CREATE INDEX IF NOT EXISTS media_edit_pairs_profile_idx
ON media_edit_pairs(profile_id, updated_at DESC);
"""

SYSTEM_PROFILE_TIMESTAMP = "2026-04-11T00:00:00.000Z"

# System profile contract
SYSTEM_PROFILES = [
    ContentProfile(
        id="generic",
        name="Generic",
        label="Generic",
        description="High-recall surfacing for creator review. Always available regardless of personalization state.",
        created_at=SYSTEM_PROFILE_TIMESTAMP,
        updated_at=SYSTEM_PROFILE_TIMESTAMP,
        state="ACTIVE",
        source="SYSTEM",
        mode="BROAD",
        signal_weights={
            ReasonCode.REACTION_PHRASE: 1,
            ReasonCode.LOUDNESS_SPIKE: 0.95,
            ReasonCode.COMMENTARY_DENSITY: 0.75,
            ReasonCode.STRUCTURE_SETUP: 0.65,
            ReasonCode.STRUCTURE_CONSEQUENCE: 0.7,
            ReasonCode.STRUCTURE_RESOLUTION: 0.7,
            ReasonCode.MENU_HEAVY: -0.75,
            ReasonCode.CLEANUP_HEAVY: -0.6,
            ReasonCode.LOW_INFORMATION: -0.45,
            ReasonCode.CONTEXT_REQUIRED: -0.25,
        },
    ),
    ContentProfile(
        id="stealth",
        name="Stealth",
        label="Stealth",
        description="Rewards tension, anticipation, and payoff while suppressing noisy false positives.",
        created_at=SYSTEM_PROFILE_TIMESTAMP,
        updated_at=SYSTEM_PROFILE_TIMESTAMP,
        state="ACTIVE",
        source="SYSTEM",
        mode="CONTEXTUAL",
        signal_weights={
            ReasonCode.STRUCTURE_SETUP: 0.95,
            ReasonCode.TACTICAL_NARRATION: 0.9,
            ReasonCode.SILENCE_BREAK: 0.8,
            ReasonCode.ABRUPT_SILENCE_AFTER_INTENSITY: 0.75,
            ReasonCode.COMMENTARY_DENSITY: 0.55,
            ReasonCode.LOUDNESS_SPIKE: 0.35,
            ReasonCode.MENU_HEAVY: -0.85,
            ReasonCode.CLEANUP_HEAVY: -0.7,
        },
    ),
    ContentProfile(
        id="raid_coop",
        name="Raid / Co-op",
        label="Raid / Co-op",
        description="Prioritizes team chatter, overlap spikes, wipes, recoveries, and shared reactions.",
        created_at=SYSTEM_PROFILE_TIMESTAMP,
        updated_at=SYSTEM_PROFILE_TIMESTAMP,
        state="ACTIVE",
        source="SYSTEM",
        mode="CONTEXTUAL",
        signal_weights={
            ReasonCode.OVERLAP_SPIKE: 1,
            ReasonCode.LAUGHTER_BURST: 0.8,
            ReasonCode.COMMENTARY_DENSITY: 0.75,
            ReasonCode.STRUCTURE_CONSEQUENCE: 0.85,
            ReasonCode.STRUCTURE_RESOLUTION: 0.8,
            ReasonCode.ACTION_AUDIO_CLUSTER: 0.65,
            ReasonCode.CLEANUP_HEAVY: -0.55,
            ReasonCode.LOW_INFORMATION: -0.5,
        },
    ),
    ContentProfile(
        id="exploration",
        name="Exploration",
        label="Exploration",
        description="Biases toward discovery, realization, and clue-resolution pacing over pure intensity.",
        created_at=SYSTEM_PROFILE_TIMESTAMP,
        updated_at=SYSTEM_PROFILE_TIMESTAMP,
        state="ACTIVE",
        source="SYSTEM",
        mode="CONTEXTUAL",
        signal_weights={
            ReasonCode.STRUCTURE_SETUP: 0.9,
            ReasonCode.STRUCTURE_RESOLUTION: 0.95,
            ReasonCode.REACTION_PHRASE: 0.7,
            ReasonCode.PITCH_EXCURSION: 0.55,
            ReasonCode.COMMENTARY_DENSITY: 0.45,
            ReasonCode.LOUDNESS_SPIKE: 0.2,
            ReasonCode.LOW_INFORMATION: -0.3,
            ReasonCode.CONTEXT_REQUIRED: -0.15,
        },
    ),
]


# Analyzer persistence boundary
class SessionStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path)

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "project_sessions", "session_json", "TEXT")
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)
            connection.commit()

    # Session write path
    def save_session(self, session: ProjectSession) -> None:
        accepted_count = sum(
            1 for decision in session.review_decisions if decision.action.value == "ACCEPT"
        )
        rejected_count = sum(
            1 for decision in session.review_decisions if decision.action.value == "REJECT"
        )
        deferred_count = sum(
            1 for decision in session.review_decisions if decision.action.value == "DEFER"
        )
        with self._connection() as connection:
            connection.executescript(SCHEMA_SQL)
            self._seed_system_profiles(connection)
            connection.execute(
                """
                INSERT OR REPLACE INTO project_sessions (
                  id, title, media_path, profile_id, settings_json, summary_json, session_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session.id,
                    session.title,
                    session.media_source.path,
                    session.profile_id,
                    self._to_json(session.settings),
                    self._to_json(
                        {
                            "status": session.status,
                            "analysis_coverage": self._convert(session.analysis_coverage),
                            "candidate_count": len(session.candidates),
                            "accepted_count": accepted_count,
                            "rejected_count": rejected_count,
                            "deferred_count": deferred_count,
                            "pending_count": max(
                                len(session.candidates)
                                - accepted_count
                                - rejected_count
                                - deferred_count,
                                0,
                            ),
                        }
                    ),
                    self._to_json(session),
                    session.created_at,
                    session.updated_at,
                ),
            )

            connection.execute(
                "DELETE FROM candidate_windows WHERE project_session_id = ?",
                (session.id,),
            )
            for candidate in session.candidates:
                connection.execute(
                    """
                    INSERT INTO candidate_windows (
                      id, project_session_id, confidence_band, transcript_snippet,
                      candidate_window_json, suggested_segment_json, score_breakdown_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        candidate.id,
                        session.id,
                        candidate.confidence_band.value,
                        candidate.transcript_snippet,
                        self._to_json(candidate.candidate_window),
                        self._to_json(candidate.suggested_segment),
                        self._to_json(candidate.score_breakdown),
                    ),
                )

            connection.execute(
                "DELETE FROM review_decisions WHERE project_session_id = ?",
                (session.id,),
            )
            for decision in session.review_decisions:
                connection.execute(
                    """
                    INSERT INTO review_decisions (
                      id, project_session_id, candidate_id, action,
                      label, adjusted_segment_json, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        decision.id,
                        decision.project_session_id,
                        decision.candidate_id,
                        decision.action.value,
                        decision.label,
                        self._to_json(decision.adjusted_segment)
                        if decision.adjusted_segment
                        else None,
                        decision.notes,
                        decision.created_at,
                    ),
                )

            connection.execute(
                """
                INSERT OR REPLACE INTO analysis_artifacts (
                  project_session_id, transcript_json, speech_regions_json, feature_windows_json
                ) VALUES (?, ?, ?, ?)
                """,
                (
                    session.id,
                    self._to_json(session.transcript),
                    self._to_json(session.speech_regions),
                    self._to_json(session.feature_windows),
                ),
            )
            connection.commit()

    def save_review_decision(self, decision: ReviewDecision) -> None:
        with self._connection() as connection:
            connection.executescript(SCHEMA_SQL)
            self._seed_system_profiles(connection)
            connection.execute(
                """
                INSERT INTO review_decisions (
                  id, project_session_id, candidate_id, action,
                  label, adjusted_segment_json, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_session_id, candidate_id) DO UPDATE SET
                  id = excluded.id,
                  action = excluded.action,
                  label = excluded.label,
                  adjusted_segment_json = excluded.adjusted_segment_json,
                  notes = excluded.notes,
                  created_at = excluded.created_at
                """,
                (
                    decision.id,
                    decision.project_session_id,
                    decision.candidate_id,
                    decision.action.value,
                    decision.label,
                    self._to_json(decision.adjusted_segment) if decision.adjusted_segment else None,
                    decision.notes,
                    decision.created_at,
                ),
            )
            self._refresh_session_summary(connection, decision.project_session_id, decision.created_at)
            connection.commit()

    # Profile catalog boundary
    def list_profiles(self) -> list[ContentProfile]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._seed_system_profiles(connection)

            rows = connection.execute(
                """
                SELECT id, name, description, state, source, mode, signal_weights_json, created_at, updated_at
                FROM clip_profiles
                ORDER BY CASE source WHEN 'SYSTEM' THEN 0 ELSE 1 END, updated_at DESC, name ASC
                """
            ).fetchall()
            profiles = [self._profile_from_row(connection, row) for row in rows]
            connection.commit()
            return profiles

    def load_profile(self, profile_id: str) -> ContentProfile:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._seed_system_profiles(connection)

            row = connection.execute(
                """
                SELECT id, name, description, state, source, mode, signal_weights_json, created_at, updated_at
                FROM clip_profiles
                WHERE id = ?
                """,
                (profile_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Clip profile not found: {profile_id}")

            profile = self._profile_from_row(connection, row)
            connection.commit()
            return profile

    def create_profile(
        self,
        *,
        name: str,
        description: str = "",
        state: str = "ACTIVE",
    ) -> ContentProfile:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Profile name is required")

        normalized_description = description.strip()
        now = datetime.now(timezone.utc).isoformat()
        profile_id = self._generate_profile_id(normalized_name)

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)
            connection.execute(
                """
                INSERT INTO clip_profiles (
                  id, name, description, state, source, mode, signal_weights_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile_id,
                    normalized_name,
                    normalized_description,
                    state,
                    "USER",
                    "EXAMPLE_DRIVEN",
                    self._to_json({}),
                    now,
                    now,
                ),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, name, description, state, source, mode, signal_weights_json, created_at, updated_at
                FROM clip_profiles
                WHERE id = ?
                """,
                (profile_id,),
            ).fetchone()

        if row is None:
            raise KeyError(f"Profile not found after create: {profile_id}")

        return self._profile_from_row(None, row)

    def profile_exists(self, profile_id: str) -> bool:
        with self._connection() as connection:
            connection.executescript(SCHEMA_SQL)
            self._seed_system_profiles(connection)
            row = connection.execute(
                "SELECT 1 FROM clip_profiles WHERE id = ?",
                (profile_id,),
            ).fetchone()
        return row is not None

    def resolve_profile_id(self, profile_id: str | None) -> str:
        normalized_profile_id = (profile_id or "").strip() or "generic"
        if self.profile_exists(normalized_profile_id):
            return normalized_profile_id
        return "generic"

    def list_example_clips(self, profile_id: str) -> list[ExampleClip]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)
            self._ensure_profile_exists(connection, profile_id)
            examples = self._profile_reference_examples(connection, profile_id)
            connection.commit()
            return examples

    def add_example_clip(
        self,
        profile_id: str,
        *,
        source_type: str,
        source_value: str,
        title: str | None = None,
        note: str | None = None,
    ) -> ExampleClip:
        normalized_source_type = ExampleClipSourceType(source_type)
        normalized_source_value = source_value.strip()
        if not normalized_source_value:
            raise ValueError("Example clip sourceValue is required")

        normalized_title = title.strip() if title else None
        normalized_note = note.strip() if note else None
        normalized_source_value = self._normalize_example_source_value(
            normalized_source_type,
            normalized_source_value,
        )
        status, status_detail = self._derive_example_status(
            normalized_source_type,
            normalized_source_value,
        )
        now = datetime.now(timezone.utc).isoformat()
        example_id = f"example_{uuid.uuid4().hex[:12]}"

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._seed_system_profiles(connection)
            self._ensure_profile_exists(connection, profile_id)
            feature_summary = None
            if normalized_source_type in {
                ExampleClipSourceType.LOCAL_FILE_PATH,
                ExampleClipSourceType.LOCAL_FILE_UPLOAD,
            } and status == ExampleClipStatus.LOCAL_FILE_AVAILABLE:
                feature_summary, status_detail = self._summarize_local_example(
                    normalized_source_value,
                )
            connection.execute(
                """
                INSERT INTO example_clips (
                  id, profile_id, source_type, source_value, title, note,
                  status, status_detail, summary_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    example_id,
                    profile_id,
                    normalized_source_type.value,
                    normalized_source_value,
                    normalized_title,
                    normalized_note,
                    status.value,
                    status_detail,
                    self._to_json(feature_summary) if feature_summary else None,
                    now,
                    now,
                ),
            )
            connection.execute(
                """
                UPDATE clip_profiles
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, profile_id),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, profile_id, source_type, source_value, title, note,
                       status, status_detail, summary_json, created_at, updated_at
                FROM example_clips
                WHERE id = ?
                """,
                (example_id,),
            ).fetchone()

            if row is None:
                raise KeyError(f"Example clip not found after create: {example_id}")

            return self._example_clip_from_row(connection, row)

    # Media library persistence
    def list_media_library_assets(self) -> list[MediaLibraryAsset]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)

            rows = connection.execute(
                """
                SELECT id, asset_type, scope, profile_id, source_type, source_value,
                       title, note, status, status_detail, summary_json,
                       index_summary_json, created_at, updated_at
                FROM media_library_assets
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()
            assets = [self._media_library_asset_from_row(connection, row) for row in rows]
            connection.commit()
            return assets

    def create_media_library_asset(
        self,
        *,
        asset_type: str,
        scope: str,
        profile_id: str | None = None,
        source_type: str,
        source_value: str,
        title: str | None = None,
        note: str | None = None,
    ) -> MediaLibraryAsset:
        normalized_asset_type = MediaLibraryAssetType(asset_type)
        normalized_scope = MediaLibraryAssetScope(scope)
        normalized_source_type = ExampleClipSourceType(source_type)
        normalized_source_value = source_value.strip()
        if not normalized_source_value:
            raise ValueError("Media library asset sourceValue is required")

        if normalized_scope == MediaLibraryAssetScope.PROFILE and not profile_id:
            raise ValueError("profileId is required when scope is PROFILE")

        if (
            normalized_asset_type in {MediaLibraryAssetType.VOD, MediaLibraryAssetType.EDIT}
            and normalized_source_type
            not in {
                ExampleClipSourceType.LOCAL_FILE_PATH,
                ExampleClipSourceType.LOCAL_FILE_UPLOAD,
            }
        ):
            raise ValueError("VOD and EDIT assets must point to a local file path")

        normalized_title = title.strip() if title else None
        normalized_note = note.strip() if note else None
        normalized_profile_id = profile_id.strip() if profile_id else None
        normalized_source_value = self._normalize_example_source_value(
            normalized_source_type,
            normalized_source_value,
        )
        status, status_detail = self._derive_example_status(
            normalized_source_type,
            normalized_source_value,
        )
        now = datetime.now(timezone.utc).isoformat()
        asset_id = f"asset_{uuid.uuid4().hex[:12]}"

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "example_clips", "summary_json", "TEXT")
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)
            if normalized_profile_id:
                self._ensure_profile_exists(connection, normalized_profile_id)

            feature_summary = None
            index_summary = None
            if normalized_source_type in {
                ExampleClipSourceType.LOCAL_FILE_PATH,
                ExampleClipSourceType.LOCAL_FILE_UPLOAD,
            } and status == ExampleClipStatus.LOCAL_FILE_AVAILABLE:
                status_detail = (
                    "Local media reference saved. Start an index job to extract bounded metadata "
                    "without blocking the app."
                )

            connection.execute(
                """
                INSERT INTO media_library_assets (
                  id, asset_type, scope, profile_id, source_type, source_value,
                  title, note, status, status_detail, summary_json, index_summary_json,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    asset_id,
                    normalized_asset_type.value,
                    normalized_scope.value,
                    normalized_profile_id,
                    normalized_source_type.value,
                    normalized_source_value,
                    normalized_title,
                    normalized_note,
                    status.value,
                    status_detail,
                    self._to_json(feature_summary) if feature_summary else None,
                    self._to_json(index_summary) if index_summary else None,
                    now,
                    now,
                ),
            )
            if normalized_profile_id:
                connection.execute(
                    """
                    UPDATE clip_profiles
                    SET updated_at = ?
                    WHERE id = ?
                    """,
                    (now, normalized_profile_id),
                )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, asset_type, scope, profile_id, source_type, source_value,
                       title, note, status, status_detail, summary_json,
                       index_summary_json, created_at, updated_at
                FROM media_library_assets
                WHERE id = ?
                """,
                (asset_id,),
            ).fetchone()

            if row is None:
                raise KeyError(f"Media library asset not found after create: {asset_id}")

            return self._media_library_asset_from_row(connection, row)

    def replace_media_thumbnail_outputs(
        self,
        asset_id: str,
        *,
        selected_suggestion_ids: list[str],
    ) -> MediaLibraryAsset:
        normalized_asset_id = asset_id.strip()
        if not normalized_asset_id:
            raise ValueError("assetId is required")

        normalized_suggestion_ids = [
            suggestion_id.strip()
            for suggestion_id in selected_suggestion_ids
            if suggestion_id.strip()
        ]
        if len(normalized_suggestion_ids) != len(set(normalized_suggestion_ids)):
            raise ValueError("selectedSuggestionIds must be unique")

        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            asset = self._load_media_library_asset(connection, normalized_asset_id)
            suggestion_set = asset.thumbnail_suggestion_set
            suggestion_by_id = {
                suggestion.id: suggestion
                for suggestion in (suggestion_set.suggestions if suggestion_set else [])
            }

            if normalized_suggestion_ids and not suggestion_set:
                raise ValueError(
                    "Thumbnail suggestions are not ready for this asset. Run media indexing first."
                )

            missing_suggestion_ids = [
                suggestion_id
                for suggestion_id in normalized_suggestion_ids
                if suggestion_id not in suggestion_by_id
            ]
            if missing_suggestion_ids:
                raise ValueError(
                    "Selected thumbnail suggestions are no longer available on this asset."
                )

            connection.execute(
                "DELETE FROM media_thumbnail_outputs WHERE asset_id = ?",
                (normalized_asset_id,),
            )

            for position, suggestion_id in enumerate(normalized_suggestion_ids):
                suggestion = suggestion_by_id[suggestion_id]
                output_id = f"thumb_output_{uuid.uuid4().hex[:12]}"
                connection.execute(
                    """
                    INSERT INTO media_thumbnail_outputs (
                      id, asset_id, source_suggestion_id, position, payload_json,
                      selected_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        output_id,
                        normalized_asset_id,
                        suggestion.id,
                        position,
                        self._to_json(
                            {
                                "image_path": suggestion.image_path,
                                "timestamp_seconds": suggestion.timestamp_seconds,
                                "score": suggestion.score,
                                "activity_score": suggestion.activity_score,
                                "brightness_score": suggestion.brightness_score,
                                "contrast_score": suggestion.contrast_score,
                                "sharpness_score": suggestion.sharpness_score,
                                "note": suggestion.note,
                            }
                        ),
                        now,
                        now,
                    ),
                )

            connection.execute(
                """
                UPDATE media_library_assets
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, normalized_asset_id),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, asset_type, scope, profile_id, source_type, source_value,
                       title, note, status, status_detail, summary_json,
                       index_summary_json, created_at, updated_at
                FROM media_library_assets
                WHERE id = ?
                """,
                (normalized_asset_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media library asset not found after update: {normalized_asset_id}")
            return self._media_library_asset_from_row(connection, row)

    def list_media_edit_pairs(self) -> list[MediaEditPair]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            self._seed_system_profiles(connection)

            rows = connection.execute(
                """
                SELECT id, vod_asset_id, edit_asset_id, profile_id, title, note,
                       status, status_detail, summary_json, created_at, updated_at
                FROM media_edit_pairs
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()
            pairs = [self._media_edit_pair_from_row(connection, row) for row in rows]
            connection.commit()
            return pairs

    def create_media_edit_pair(
        self,
        vod_asset_id: str,
        edit_asset_id: str,
        *,
        profile_id: str | None = None,
        title: str | None = None,
        note: str | None = None,
    ) -> MediaEditPair:
        normalized_vod_asset_id = vod_asset_id.strip()
        normalized_edit_asset_id = edit_asset_id.strip()
        normalized_profile_id = profile_id.strip() if profile_id else None
        if not normalized_vod_asset_id or not normalized_edit_asset_id:
            raise ValueError("vodAssetId and editAssetId are required")
        if normalized_vod_asset_id == normalized_edit_asset_id:
            raise ValueError("vodAssetId and editAssetId must be different assets")

        now = datetime.now(timezone.utc).isoformat()
        pair_id = f"pair_{uuid.uuid4().hex[:12]}"

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._seed_system_profiles(connection)
            if normalized_profile_id:
                self._ensure_profile_exists(connection, normalized_profile_id)

            vod_asset = self._load_media_library_asset(connection, normalized_vod_asset_id)
            edit_asset = self._load_media_library_asset(connection, normalized_edit_asset_id)

            if vod_asset.asset_type != MediaLibraryAssetType.VOD:
                raise ValueError("vodAssetId must reference a VOD asset")
            if edit_asset.asset_type != MediaLibraryAssetType.EDIT:
                raise ValueError("editAssetId must reference an EDIT asset")

            pair_summary = self._build_media_edit_pair_summary(vod_asset, edit_asset)
            connection.execute(
                """
                INSERT INTO media_edit_pairs (
                  id, vod_asset_id, edit_asset_id, profile_id, title, note,
                  status, status_detail, summary_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pair_id,
                    normalized_vod_asset_id,
                    normalized_edit_asset_id,
                    normalized_profile_id,
                    title.strip() if title else None,
                    note.strip() if note else None,
                    pair_summary["status"],
                    pair_summary["status_detail"],
                    self._to_json(pair_summary),
                    now,
                    now,
                ),
            )
            if normalized_profile_id:
                connection.execute(
                    """
                    UPDATE clip_profiles
                    SET updated_at = ?
                    WHERE id = ?
                    """,
                    (now, normalized_profile_id),
                )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, vod_asset_id, edit_asset_id, profile_id, title, note,
                       status, status_detail, summary_json, created_at, updated_at
                FROM media_edit_pairs
                WHERE id = ?
                """,
                (pair_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media edit pair not found after create: {pair_id}")

            return self._media_edit_pair_from_row(connection, row)

    # Index job boundary
    def list_media_index_jobs(self) -> list[MediaIndexJob]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            rows = connection.execute(
                """
                SELECT id, asset_id, status, progress, status_detail, error_message,
                       result_json, created_at, updated_at, started_at, finished_at, cancelled_at
                FROM media_index_jobs
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()
            return [self._media_index_job_from_row(row) for row in rows]

    def list_media_index_artifacts(
        self,
        asset_id: str | None = None,
    ) -> list[MediaIndexArtifact]:
        normalized_asset_id = asset_id.strip() if asset_id else None
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            if normalized_asset_id:
                rows = connection.execute(
                    """
                    SELECT id, asset_id, job_id, kind, method, summary_json, payload_json,
                           created_at, updated_at
                    FROM media_index_artifacts
                    WHERE asset_id = ?
                    ORDER BY updated_at DESC, created_at DESC
                    """,
                    (normalized_asset_id,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT id, asset_id, job_id, kind, method, summary_json, payload_json,
                           created_at, updated_at
                    FROM media_index_artifacts
                    ORDER BY updated_at DESC, created_at DESC
                    """
                ).fetchall()
            return [self._media_index_artifact_from_row(row) for row in rows]

    def save_media_index_artifact(
        self,
        artifact: MediaIndexArtifact,
    ) -> MediaIndexArtifact:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._load_media_library_asset(connection, artifact.asset_id)
            connection.execute(
                """
                INSERT OR REPLACE INTO media_index_artifacts (
                  id, asset_id, job_id, kind, method, summary_json, payload_json,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact.id,
                    artifact.asset_id,
                    artifact.job_id,
                    artifact.kind.value,
                    artifact.method.value,
                    self._to_json(self._media_index_artifact_summary_payload(artifact)),
                    self._to_json(
                        {
                            "buckets": artifact.buckets,
                            "thumbnail_suggestions": artifact.thumbnail_suggestions,
                        }
                    ),
                    artifact.created_at,
                    artifact.updated_at,
                ),
            )
            connection.execute(
                """
                UPDATE media_library_assets
                SET updated_at = ?
                WHERE id = ?
                """,
                (artifact.updated_at, artifact.asset_id),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, asset_id, job_id, kind, method, summary_json, payload_json,
                       created_at, updated_at
                FROM media_index_artifacts
                WHERE id = ?
                """,
                (artifact.id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media index artifact not found after save: {artifact.id}")
            return self._media_index_artifact_from_row(row)

    def load_latest_audio_fingerprint_artifact(
        self,
        asset_id: str,
    ) -> MediaIndexArtifact:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            row = connection.execute(
                """
                SELECT id, asset_id, job_id, kind, method, summary_json, payload_json,
                       created_at, updated_at
                FROM media_index_artifacts
                WHERE asset_id = ? AND kind = ?
                ORDER BY
                  CASE method
                    WHEN 'DECODED_AUDIO_FINGERPRINT_V1' THEN 0
                    ELSE 1
                  END,
                  updated_at DESC,
                  created_at DESC
                LIMIT 1
                """,
                (asset_id, MediaIndexArtifactKind.AUDIO_FINGERPRINT.value),
            ).fetchone()
            if row is None:
                raise KeyError(f"Audio fingerprint artifact not found for asset: {asset_id}")
            return self._media_index_artifact_from_row(row)

    def create_media_index_job(self, asset_id: str) -> MediaIndexJob:
        normalized_asset_id = asset_id.strip()
        if not normalized_asset_id:
            raise ValueError("assetId is required")

        now = datetime.now(timezone.utc).isoformat()
        job_id = f"index_job_{uuid.uuid4().hex[:12]}"

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            asset = self._load_media_library_asset(connection, normalized_asset_id)
            if asset.source_type not in {
                ExampleClipSourceType.LOCAL_FILE_PATH,
                ExampleClipSourceType.LOCAL_FILE_UPLOAD,
            }:
                raise ValueError("Only local media assets can be indexed")

            active_row = connection.execute(
                """
                SELECT id, asset_id, status, progress, status_detail, error_message,
                       result_json, created_at, updated_at, started_at, finished_at, cancelled_at
                FROM media_index_jobs
                WHERE asset_id = ? AND status IN ('QUEUED', 'RUNNING')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (normalized_asset_id,),
            ).fetchone()
            if active_row is not None:
                return self._media_index_job_from_row(active_row)

            connection.execute(
                """
                INSERT INTO media_index_jobs (
                  id, asset_id, status, progress, status_detail, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    normalized_asset_id,
                    MediaIndexJobStatus.QUEUED.value,
                    0.0,
                    "Media index job queued.",
                    now,
                    now,
                ),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT id, asset_id, status, progress, status_detail, error_message,
                       result_json, created_at, updated_at, started_at, finished_at, cancelled_at
                FROM media_index_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media index job not found after create: {job_id}")
            return self._media_index_job_from_row(row)

    def claim_media_index_job(self, job_id: str) -> MediaIndexJob | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            row = connection.execute(
                """
                SELECT status
                FROM media_index_jobs
                WHERE id = ?
                """,
                (job_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media index job not found: {job_id}")
            if row["status"] != MediaIndexJobStatus.QUEUED.value:
                return None

            connection.execute(
                """
                UPDATE media_index_jobs
                SET status = ?, progress = ?, status_detail = ?, started_at = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    MediaIndexJobStatus.RUNNING.value,
                    0.15,
                    "Indexing local media metadata with bounded probes.",
                    now,
                    now,
                    job_id,
                    MediaIndexJobStatus.QUEUED.value,
                ),
            )
            connection.commit()
            return self._load_media_index_job(connection, job_id)

    def update_media_index_job_progress(
        self,
        job_id: str,
        *,
        progress: float,
        status_detail: str,
    ) -> MediaIndexJob:
        now = datetime.now(timezone.utc).isoformat()
        bounded_progress = min(max(progress, 0.0), 0.99)
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            connection.execute(
                """
                UPDATE media_index_jobs
                SET progress = ?, status_detail = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    bounded_progress,
                    status_detail,
                    now,
                    job_id,
                    MediaIndexJobStatus.RUNNING.value,
                ),
            )
            connection.commit()
            return self._load_media_index_job(connection, job_id)

    def complete_media_index_job(
        self,
        job_id: str,
        result: MediaIndexSummary,
        *,
        feature_summary: ExampleClipFeatureSummary | None = None,
        asset_status_detail: str | None = None,
    ) -> MediaIndexJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_media_library_asset_columns(connection)
            job = self._load_media_index_job(connection, job_id)
            if job.status == MediaIndexJobStatus.CANCELLED:
                return job

            result_json = self._to_json(result)
            connection.execute(
                """
                UPDATE media_index_jobs
                SET status = ?, progress = ?, status_detail = ?, error_message = NULL,
                    result_json = ?, finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaIndexJobStatus.SUCCEEDED.value,
                    1.0,
                    "Media index ready.",
                    result_json,
                    now,
                    now,
                    job_id,
                ),
            )
            connection.execute(
                """
                UPDATE media_library_assets
                SET status = ?, status_detail = ?, summary_json = ?, index_summary_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    ExampleClipStatus.LOCAL_FILE_AVAILABLE.value,
                    asset_status_detail
                    or "Media index ready for matching and VOD/edit comparison.",
                    self._to_json(feature_summary) if feature_summary else None,
                    result_json,
                    now,
                    job.asset_id,
                ),
            )
            connection.commit()
            return self._load_media_index_job(connection, job_id)

    def fail_media_index_job(self, job_id: str, error_message: str) -> MediaIndexJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_index_job(connection, job_id)
            if job.status == MediaIndexJobStatus.CANCELLED:
                return job

            connection.execute(
                """
                UPDATE media_index_jobs
                SET status = ?, progress = ?, status_detail = ?, error_message = ?,
                    finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaIndexJobStatus.FAILED.value,
                    job.progress,
                    "Media index failed.",
                    error_message,
                    now,
                    now,
                    job_id,
                ),
            )
            connection.commit()
            return self._load_media_index_job(connection, job_id)

    def cancel_media_index_job(self, job_id: str) -> MediaIndexJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_index_job(connection, job_id)
            if job.status not in {
                MediaIndexJobStatus.QUEUED,
                MediaIndexJobStatus.RUNNING,
            }:
                return job

            connection.execute(
                """
                UPDATE media_index_jobs
                SET status = ?, status_detail = ?, cancelled_at = ?, finished_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaIndexJobStatus.CANCELLED.value,
                    "Media index job cancelled.",
                    now,
                    now,
                    now,
                    job_id,
                ),
            )
            connection.commit()
            return self._load_media_index_job(connection, job_id)

    def media_index_job_is_cancelled(self, job_id: str) -> bool:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            row = connection.execute(
                "SELECT status FROM media_index_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Media index job not found: {job_id}")
            return row["status"] == MediaIndexJobStatus.CANCELLED.value

    # Alignment job boundary
    def list_media_alignment_jobs(self) -> list[MediaAlignmentJob]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            rows = connection.execute(
                """
                SELECT id, pair_id, source_asset_id, query_asset_id, status, progress,
                       status_detail, error_message, method, match_count, created_at,
                       updated_at, started_at, finished_at, cancelled_at
                FROM media_alignment_jobs
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()
            return [self._media_alignment_job_from_row(row) for row in rows]

    def list_media_alignment_matches(
        self,
        pair_id: str | None = None,
    ) -> list[MediaAlignmentMatch]:
        normalized_pair_id = pair_id.strip() if pair_id else None
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            if normalized_pair_id:
                rows = connection.execute(
                    """
                    SELECT id, job_id, pair_id, source_asset_id, query_asset_id, kind, method,
                           source_range_json, query_range_json, score, confidence_score,
                           matched_bucket_count, total_query_bucket_count, bucket_matches_json,
                           note, created_at, updated_at
                    FROM media_alignment_matches
                    WHERE pair_id = ?
                    ORDER BY confidence_score DESC, updated_at DESC
                    """,
                    (normalized_pair_id,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT id, job_id, pair_id, source_asset_id, query_asset_id, kind, method,
                           source_range_json, query_range_json, score, confidence_score,
                           matched_bucket_count, total_query_bucket_count, bucket_matches_json,
                           note, created_at, updated_at
                    FROM media_alignment_matches
                    ORDER BY updated_at DESC, confidence_score DESC
                    """
                ).fetchall()
            return [self._media_alignment_match_from_row(row) for row in rows]

    def create_media_alignment_job(
        self,
        *,
        pair_id: str | None = None,
        source_asset_id: str | None = None,
        query_asset_id: str | None = None,
    ) -> MediaAlignmentJob:
        normalized_pair_id = pair_id.strip() if pair_id else None
        normalized_source_asset_id = source_asset_id.strip() if source_asset_id else None
        normalized_query_asset_id = query_asset_id.strip() if query_asset_id else None

        now = datetime.now(timezone.utc).isoformat()
        job_id = f"align_job_{uuid.uuid4().hex[:12]}"

        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            if normalized_pair_id:
                pair = self._load_media_edit_pair(connection, normalized_pair_id)
                normalized_source_asset_id = pair.vod_asset_id
                normalized_query_asset_id = pair.edit_asset_id

            if not normalized_source_asset_id or not normalized_query_asset_id:
                raise ValueError("pairId or sourceAssetId and queryAssetId are required")
            if normalized_source_asset_id == normalized_query_asset_id:
                raise ValueError("sourceAssetId and queryAssetId must be different assets")

            self._load_media_library_asset(connection, normalized_source_asset_id)
            self._load_media_library_asset(connection, normalized_query_asset_id)

            active_row = connection.execute(
                """
                SELECT id, pair_id, source_asset_id, query_asset_id, status, progress,
                       status_detail, error_message, method, match_count, created_at,
                       updated_at, started_at, finished_at, cancelled_at
                FROM media_alignment_jobs
                WHERE source_asset_id = ? AND query_asset_id = ?
                  AND COALESCE(pair_id, '') = COALESCE(?, '')
                  AND status IN ('QUEUED', 'RUNNING')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (
                    normalized_source_asset_id,
                    normalized_query_asset_id,
                    normalized_pair_id,
                ),
            ).fetchone()
            if active_row is not None:
                return self._media_alignment_job_from_row(active_row)

            source_asset = self._load_media_library_asset(
                connection,
                normalized_source_asset_id,
            )
            query_asset = self._load_media_library_asset(
                connection,
                normalized_query_asset_id,
            )
            self._ensure_media_alignment_prerequisites(
                source_asset=source_asset,
                query_asset=query_asset,
            )

            connection.execute(
                """
                INSERT INTO media_alignment_jobs (
                  id, pair_id, source_asset_id, query_asset_id, status, progress,
                  status_detail, method, match_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    normalized_pair_id,
                    normalized_source_asset_id,
                    normalized_query_asset_id,
                    MediaAlignmentJobStatus.QUEUED.value,
                    0.0,
                    "Media alignment job queued.",
                    MediaAlignmentMethod.AUDIO_PROXY_BUCKET_CORRELATION_V1.value,
                    0,
                    now,
                    now,
                ),
            )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def _ensure_media_alignment_prerequisites(
        self,
        *,
        source_asset: MediaLibraryAsset,
        query_asset: MediaLibraryAsset,
    ) -> None:
        missing_requirements: list[str] = []
        for asset, role_label in (
            (source_asset, "source VOD"),
            (query_asset, "edited video"),
        ):
            asset_label = asset.title or asset.id
            if asset.index_summary is None:
                missing_requirements.append(
                    f'{role_label} "{asset_label}" has not been indexed yet'
                )
                continue

            if not asset.index_artifact_summary or not (
                asset.index_artifact_summary.latest_audio_fingerprint_artifact_id
            ):
                missing_requirements.append(
                    f'{role_label} "{asset_label}" does not have an audio fingerprint artifact yet'
                )

        if missing_requirements:
            raise ValueError(
                "Cannot start media alignment yet. "
                + "; ".join(missing_requirements)
                + ". Run Index media for both assets first."
            )

    def claim_media_alignment_job(self, job_id: str) -> MediaAlignmentJob | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_alignment_job(connection, job_id)
            if job.status != MediaAlignmentJobStatus.QUEUED:
                return None

            connection.execute(
                """
                UPDATE media_alignment_jobs
                SET status = ?, progress = ?, status_detail = ?, started_at = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    MediaAlignmentJobStatus.RUNNING.value,
                    0.2,
                    "Loading indexed audio proxy artifacts.",
                    now,
                    now,
                    job_id,
                    MediaAlignmentJobStatus.QUEUED.value,
                ),
            )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def update_media_alignment_job_progress(
        self,
        job_id: str,
        *,
        progress: float,
        status_detail: str,
    ) -> MediaAlignmentJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            connection.execute(
                """
                UPDATE media_alignment_jobs
                SET progress = ?, status_detail = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                (
                    min(max(progress, 0.0), 0.99),
                    status_detail,
                    now,
                    job_id,
                    MediaAlignmentJobStatus.RUNNING.value,
                ),
            )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def save_media_alignment_matches(
        self,
        job_id: str,
        matches: list[MediaAlignmentMatch],
    ) -> None:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            connection.execute(
                "DELETE FROM media_alignment_matches WHERE job_id = ?",
                (job_id,),
            )
            for match in matches:
                connection.execute(
                    """
                    INSERT INTO media_alignment_matches (
                      id, job_id, pair_id, source_asset_id, query_asset_id, kind, method,
                      source_range_json, query_range_json, score, confidence_score,
                      matched_bucket_count, total_query_bucket_count, bucket_matches_json,
                      note, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        match.id,
                        match.job_id,
                        match.pair_id,
                        match.source_asset_id,
                        match.query_asset_id,
                        match.kind.value,
                        match.method.value,
                        self._to_json(match.source_range),
                        self._to_json(match.query_range),
                        match.score,
                        match.confidence_score,
                        match.matched_bucket_count,
                        match.total_query_bucket_count,
                        self._to_json(match.bucket_matches),
                        match.note,
                        match.created_at,
                        match.updated_at,
                    ),
                )
            connection.commit()

    def complete_media_alignment_job(
        self,
        job_id: str,
        match_count: int,
    ) -> MediaAlignmentJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_alignment_job(connection, job_id)
            if job.status == MediaAlignmentJobStatus.CANCELLED:
                return job
            connection.execute(
                """
                UPDATE media_alignment_jobs
                SET status = ?, progress = ?, status_detail = ?, error_message = NULL,
                    match_count = ?, finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaAlignmentJobStatus.SUCCEEDED.value,
                    1.0,
                    f"Alignment complete with {match_count} candidate match{'es' if match_count != 1 else ''}.",
                    match_count,
                    now,
                    now,
                    job_id,
                ),
            )
            if job.pair_id:
                connection.execute(
                    """
                    UPDATE media_edit_pairs
                    SET updated_at = ?
                    WHERE id = ?
                    """,
                    (now, job.pair_id),
                )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def fail_media_alignment_job(self, job_id: str, error_message: str) -> MediaAlignmentJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_alignment_job(connection, job_id)
            if job.status == MediaAlignmentJobStatus.CANCELLED:
                return job
            connection.execute(
                """
                UPDATE media_alignment_jobs
                SET status = ?, status_detail = ?, error_message = ?,
                    finished_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaAlignmentJobStatus.FAILED.value,
                    "Media alignment failed.",
                    error_message,
                    now,
                    now,
                    job_id,
                ),
            )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def cancel_media_alignment_job(self, job_id: str) -> MediaAlignmentJob:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            job = self._load_media_alignment_job(connection, job_id)
            if job.status not in {
                MediaAlignmentJobStatus.QUEUED,
                MediaAlignmentJobStatus.RUNNING,
            }:
                return job
            connection.execute(
                """
                UPDATE media_alignment_jobs
                SET status = ?, status_detail = ?, cancelled_at = ?, finished_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    MediaAlignmentJobStatus.CANCELLED.value,
                    "Media alignment job cancelled.",
                    now,
                    now,
                    now,
                    job_id,
                ),
            )
            connection.commit()
            return self._load_media_alignment_job(connection, job_id)

    def media_alignment_job_is_cancelled(self, job_id: str) -> bool:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            return (
                self._load_media_alignment_job(connection, job_id).status
                == MediaAlignmentJobStatus.CANCELLED
            )

    # Session hydration boundary
    def count_candidates(self, project_session_id: str) -> int:
        with self._connection() as connection:
            connection.executescript(SCHEMA_SQL)
            result = connection.execute(
                "SELECT COUNT(*) FROM candidate_windows WHERE project_session_id = ?",
                (project_session_id,),
            ).fetchone()
        return int(result[0] if result else 0)

    def load_session(self, project_session_id: str) -> ProjectSession:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "project_sessions", "session_json", "TEXT")
            self._seed_system_profiles(connection)

            row = connection.execute(
                """
                SELECT id, title, media_path, profile_id, settings_json, summary_json, session_json, created_at, updated_at
                FROM project_sessions
                WHERE id = ?
                """,
                (project_session_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Project session not found: {project_session_id}")

            session = self._load_base_session(row)
            session.review_decisions = self._load_review_decisions(connection, project_session_id)
            self._apply_review_state(session, row["updated_at"])
            return session

    def list_session_summaries(self) -> list[dict[str, Any]]:
        with self._connection() as connection:
            connection.row_factory = sqlite3.Row
            connection.executescript(SCHEMA_SQL)
            self._ensure_column(connection, "project_sessions", "session_json", "TEXT")
            self._seed_system_profiles(connection)

            rows = connection.execute(
                """
                SELECT
                  project_sessions.id AS session_id,
                  project_sessions.title AS session_title,
                  project_sessions.media_path AS source_path,
                  project_sessions.profile_id AS profile_id,
                  project_sessions.summary_json AS summary_json,
                  project_sessions.session_json AS session_json,
                  project_sessions.created_at AS created_at,
                  project_sessions.updated_at AS updated_at,
                  COALESCE(candidate_counts.candidate_count, 0) AS candidate_count,
                  COALESCE(accepted_counts.accepted_count, 0) AS accepted_count,
                  COALESCE(rejected_counts.rejected_count, 0) AS rejected_count,
                  COALESCE(deferred_counts.deferred_count, 0) AS deferred_count
                FROM project_sessions
                LEFT JOIN (
                  SELECT project_session_id, COUNT(*) AS candidate_count
                  FROM candidate_windows
                  GROUP BY project_session_id
                ) AS candidate_counts
                  ON candidate_counts.project_session_id = project_sessions.id
                LEFT JOIN (
                  SELECT project_session_id, COUNT(*) AS accepted_count
                  FROM review_decisions
                  WHERE action = 'ACCEPT'
                  GROUP BY project_session_id
                ) AS accepted_counts
                  ON accepted_counts.project_session_id = project_sessions.id
                LEFT JOIN (
                  SELECT project_session_id, COUNT(*) AS rejected_count
                  FROM review_decisions
                  WHERE action = 'REJECT'
                  GROUP BY project_session_id
                ) AS rejected_counts
                  ON rejected_counts.project_session_id = project_sessions.id
                LEFT JOIN (
                  SELECT project_session_id, COUNT(*) AS deferred_count
                  FROM review_decisions
                  WHERE action = 'DEFER'
                  GROUP BY project_session_id
                ) AS deferred_counts
                  ON deferred_counts.project_session_id = project_sessions.id
                ORDER BY project_sessions.updated_at DESC
                """
            ).fetchall()

        summaries: list[dict[str, Any]] = []
        for row in rows:
            candidate_count = int(row["candidate_count"] or 0)
            accepted_count = int(row["accepted_count"] or 0)
            rejected_count = int(row["rejected_count"] or 0)
            deferred_count = int(row["deferred_count"] or 0)
            source_path = row["source_path"]
            summaries.append(
                {
                    "session_id": row["session_id"],
                    "session_title": row["session_title"],
                    "source_path": source_path,
                    "source_name": Path(source_path).name if source_path else row["session_title"],
                    "status": self._status_from_summary_json(row["summary_json"]),
                    "analysis_coverage": self._analysis_coverage_summary_from_row(
                        row["summary_json"],
                        row["session_json"],
                    ),
                    "profile_id": row["profile_id"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "candidate_count": candidate_count,
                    "accepted_count": accepted_count,
                    "rejected_count": rejected_count,
                    "deferred_count": deferred_count,
                    "pending_count": max(
                        candidate_count
                        - accepted_count
                        - rejected_count
                        - deferred_count,
                        0,
                    ),
                }
            )

        return summaries

    # Row hydration boundary
    def _seed_system_profiles(self, connection: sqlite3.Connection) -> None:
        for profile in SYSTEM_PROFILES:
            connection.execute(
                """
                INSERT OR IGNORE INTO clip_profiles (
                  id, name, description, state, source, mode, signal_weights_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile.id,
                    profile.name,
                    profile.description,
                    profile.state,
                    profile.source,
                    profile.mode,
                    self._to_json(profile.signal_weights),
                    profile.created_at,
                    profile.updated_at,
                ),
            )

    def _ensure_profile_exists(
        self,
        connection: sqlite3.Connection,
        profile_id: str,
    ) -> None:
        row = connection.execute(
            "SELECT 1 FROM clip_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Clip profile not found: {profile_id}")

    def _profile_from_row(
        self,
        connection: sqlite3.Connection | None,
        row: sqlite3.Row,
    ) -> ContentProfile:
        signal_weights = json.loads(row["signal_weights_json"])
        example_clips = (
            self._profile_reference_examples(connection, row["id"])
            if connection is not None
            else []
        )
        return ContentProfile(
            id=row["id"],
            name=row["name"],
            label=row["name"],
            description=row["description"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            state=row["state"],
            source=row["source"],
            mode=row["mode"],
            signal_weights={
                ReasonCode(key): float(value)
                for key, value in signal_weights.items()
                if key in ReasonCode._value2member_map_
            },
            example_clips=example_clips,
        )

    def _profile_reference_examples(
        self,
        connection: sqlite3.Connection,
        profile_id: str,
    ) -> list[ExampleClip]:
        examples = self._example_clips_for_profile(connection, profile_id)
        edit_examples = self._profile_edit_assets_as_examples(connection, profile_id)
        return sorted(
            examples + edit_examples,
            key=lambda example: (example.updated_at, example.created_at),
            reverse=True,
        )

    def _example_clips_for_profile(
        self,
        connection: sqlite3.Connection,
        profile_id: str,
    ) -> list[ExampleClip]:
        rows = connection.execute(
            """
            SELECT id, profile_id, source_type, source_value, title, note,
                   status, status_detail, summary_json, created_at, updated_at
            FROM example_clips
            WHERE profile_id = ?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (profile_id,),
        ).fetchall()
        return [self._example_clip_from_row(connection, row) for row in rows]

    def _profile_edit_assets_as_examples(
        self,
        connection: sqlite3.Connection,
        profile_id: str,
    ) -> list[ExampleClip]:
        rows = connection.execute(
            """
            SELECT id, profile_id, source_type, source_value, title, note,
                   status, status_detail, summary_json, created_at, updated_at
            FROM media_library_assets
            WHERE profile_id = ? AND asset_type = 'EDIT'
            ORDER BY updated_at DESC, created_at DESC
            """,
            (profile_id,),
        ).fetchall()
        return [self._profile_edit_asset_as_example_clip(connection, row) for row in rows]

    def _profile_edit_asset_as_example_clip(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> ExampleClip:
        source_type = ExampleClipSourceType(row["source_type"])
        source_value = row["source_value"]
        status = ExampleClipStatus(row["status"])
        status_detail = row["status_detail"]
        feature_summary = self._example_feature_summary_from_json(row["summary_json"])

        if source_type in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }:
            path = Path(source_value).expanduser()
            if not path.exists():
                status = ExampleClipStatus.MISSING_LOCAL_FILE
                status_detail = (
                    "Profile-scoped edit asset was saved, but the local file is not currently available."
                )
                feature_summary = None
            elif feature_summary:
                status_detail = (
                    "Indexed profile edit is active as a longform reference for future VOD matching."
                )
            else:
                status_detail = (
                    "Profile-scoped edit is saved, but it still needs indexing before it can act "
                    "as a longform matching reference."
                )

        title = row["title"] or "Profile edit reference"
        return ExampleClip(
            id=row["id"],
            profile_id=row["profile_id"],
            source_type=source_type,
            source_value=source_value,
            reference_kind=ExampleReferenceKind.PROFILE_EDIT,
            title=f"Edit reference • {title}",
            note=row["note"],
            status=status,
            status_detail=status_detail,
            feature_summary=feature_summary,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _example_clip_from_row(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> ExampleClip:
        source_type = ExampleClipSourceType(row["source_type"])
        source_value = row["source_value"]
        status = ExampleClipStatus(row["status"])
        status_detail = row["status_detail"]
        feature_summary = self._example_feature_summary_from_json(row["summary_json"])

        if source_type in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }:
            path = Path(source_value).expanduser()
            if not path.exists():
                status = ExampleClipStatus.MISSING_LOCAL_FILE
                status_detail = (
                    "Local clip path was saved, but the file is not currently available on this machine."
                )
                feature_summary = None
                connection.execute(
                    """
                    UPDATE example_clips
                    SET status = ?, status_detail = ?, summary_json = NULL
                    WHERE id = ?
                    """,
                    (
                        status.value,
                        status_detail,
                        row["id"],
                    ),
                )
            elif (
                feature_summary is None
                or feature_summary.method_version != LOCAL_FILE_HEURISTIC_VERSION
            ):
                feature_summary, status_detail = self._summarize_local_example(
                    source_value,
                )
                status = ExampleClipStatus.LOCAL_FILE_AVAILABLE
                connection.execute(
                    """
                    UPDATE example_clips
                    SET status = ?, status_detail = ?, summary_json = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        status.value,
                        status_detail,
                        self._to_json(feature_summary) if feature_summary else None,
                        feature_summary.generated_at if feature_summary else row["updated_at"],
                        row["id"],
                    ),
                )

        return ExampleClip(
            id=row["id"],
            profile_id=row["profile_id"],
            source_type=source_type,
            source_value=source_value,
            reference_kind=ExampleReferenceKind.CLIP,
            title=row["title"],
            note=row["note"],
            status=status,
            status_detail=status_detail,
            feature_summary=feature_summary,
            created_at=row["created_at"],
            updated_at=feature_summary.generated_at if feature_summary else row["updated_at"],
        )

    def _load_media_library_asset(
        self,
        connection: sqlite3.Connection,
        asset_id: str,
    ) -> MediaLibraryAsset:
        row = connection.execute(
            """
            SELECT id, asset_type, scope, profile_id, source_type, source_value,
                   title, note, status, status_detail, summary_json,
                   index_summary_json, created_at, updated_at
            FROM media_library_assets
            WHERE id = ?
            """,
            (asset_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Media library asset not found: {asset_id}")
        return self._media_library_asset_from_row(connection, row)

    def _load_media_edit_pair(
        self,
        connection: sqlite3.Connection,
        pair_id: str,
    ) -> MediaEditPair:
        row = connection.execute(
            """
            SELECT id, vod_asset_id, edit_asset_id, profile_id, title, note,
                   status, status_detail, summary_json, created_at, updated_at
            FROM media_edit_pairs
            WHERE id = ?
            """,
            (pair_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Media edit pair not found: {pair_id}")
        return self._media_edit_pair_from_row(connection, row)

    def _load_media_index_job(
        self,
        connection: sqlite3.Connection,
        job_id: str,
    ) -> MediaIndexJob:
        row = connection.execute(
            """
            SELECT id, asset_id, status, progress, status_detail, error_message,
                   result_json, created_at, updated_at, started_at, finished_at, cancelled_at
            FROM media_index_jobs
            WHERE id = ?
            """,
            (job_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Media index job not found: {job_id}")
        return self._media_index_job_from_row(row)

    def _load_media_alignment_job(
        self,
        connection: sqlite3.Connection,
        job_id: str,
    ) -> MediaAlignmentJob:
        row = connection.execute(
            """
            SELECT id, pair_id, source_asset_id, query_asset_id, status, progress,
                   status_detail, error_message, method, match_count, created_at,
                   updated_at, started_at, finished_at, cancelled_at
            FROM media_alignment_jobs
            WHERE id = ?
            """,
            (job_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Media alignment job not found: {job_id}")
        return self._media_alignment_job_from_row(row)

    def _media_index_job_from_row(self, row: sqlite3.Row) -> MediaIndexJob:
        return MediaIndexJob(
            id=row["id"],
            asset_id=row["asset_id"],
            status=MediaIndexJobStatus(row["status"]),
            progress=float(row["progress"]),
            status_detail=row["status_detail"],
            error_message=row["error_message"],
            result=self._media_index_summary_from_json(row["result_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            cancelled_at=row["cancelled_at"],
        )

    def _media_alignment_job_from_row(self, row: sqlite3.Row) -> MediaAlignmentJob:
        return MediaAlignmentJob(
            id=row["id"],
            pair_id=row["pair_id"],
            source_asset_id=row["source_asset_id"],
            query_asset_id=row["query_asset_id"],
            status=MediaAlignmentJobStatus(row["status"]),
            progress=float(row["progress"]),
            status_detail=row["status_detail"],
            error_message=row["error_message"],
            method=MediaAlignmentMethod(row["method"]),
            match_count=int(row["match_count"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            cancelled_at=row["cancelled_at"],
        )

    def _media_alignment_match_from_row(
        self,
        row: sqlite3.Row,
    ) -> MediaAlignmentMatch:
        bucket_matches = [
            MediaAlignmentBucketMatch(
                query_bucket_index=int(
                    item.get("query_bucket_index", item.get("queryBucketIndex"))
                ),
                source_bucket_index=int(
                    item.get("source_bucket_index", item.get("sourceBucketIndex"))
                ),
                score=float(item["score"]),
            )
            for item in self._json_list_from_text(row["bucket_matches_json"])
            if isinstance(item, dict)
        ]
        return MediaAlignmentMatch(
            id=row["id"],
            job_id=row["job_id"],
            pair_id=row["pair_id"],
            source_asset_id=row["source_asset_id"],
            query_asset_id=row["query_asset_id"],
            kind=MediaAlignmentMatchKind(row["kind"]),
            method=MediaAlignmentMethod(row["method"]),
            source_range=self._time_range_from_dict(
                self._json_dict_from_text(row["source_range_json"])
            ),
            query_range=self._time_range_from_dict(
                self._json_dict_from_text(row["query_range_json"])
            ),
            score=float(row["score"]),
            confidence_score=float(row["confidence_score"]),
            matched_bucket_count=int(row["matched_bucket_count"]),
            total_query_bucket_count=int(row["total_query_bucket_count"]),
            bucket_matches=bucket_matches,
            note=row["note"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _media_index_artifact_from_row(
        self,
        row: sqlite3.Row,
    ) -> MediaIndexArtifact:
        summary_payload = self._json_dict_from_text(row["summary_json"])
        payload = self._json_dict_from_text(row["payload_json"])
        buckets = [
            self._media_index_audio_bucket_from_dict(bucket)
            for bucket in payload.get("buckets", [])
            if isinstance(bucket, dict)
        ]
        thumbnail_suggestions = [
            self._media_thumbnail_suggestion_from_dict(suggestion)
            for suggestion in payload.get("thumbnail_suggestions", [])
            if isinstance(suggestion, dict)
        ]
        return MediaIndexArtifact(
            id=row["id"],
            asset_id=row["asset_id"],
            job_id=row["job_id"],
            kind=MediaIndexArtifactKind(row["kind"]),
            method=MediaIndexArtifactMethod(row["method"]),
            bucket_duration_seconds=float(summary_payload["bucket_duration_seconds"]),
            duration_seconds=float(summary_payload["duration_seconds"]),
            bucket_count=int(summary_payload["bucket_count"]),
            confidence_score=float(summary_payload["confidence_score"]),
            payload_byte_size=int(summary_payload["payload_byte_size"]),
            energy_mean=(
                float(summary_payload["energy_mean"])
                if summary_payload.get("energy_mean") is not None
                else None
            ),
            energy_peak=(
                float(summary_payload["energy_peak"])
                if summary_payload.get("energy_peak") is not None
                else None
            ),
            onset_mean=(
                float(summary_payload["onset_mean"])
                if summary_payload.get("onset_mean") is not None
                else None
            ),
            silence_share=(
                float(summary_payload["silence_share"])
                if summary_payload.get("silence_share") is not None
                else None
            ),
            sample_window_count=(
                int(summary_payload["sample_window_count"])
                if summary_payload.get("sample_window_count") is not None
                else None
            ),
            buckets=buckets,
            thumbnail_suggestions=thumbnail_suggestions,
            note=str(summary_payload["note"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _media_index_audio_bucket_from_dict(
        self,
        value: dict[str, Any],
    ) -> MediaIndexAudioBucket:
        return MediaIndexAudioBucket(
            index=int(value["index"]),
            start_seconds=float(value.get("start_seconds", value.get("startSeconds"))),
            end_seconds=float(value.get("end_seconds", value.get("endSeconds"))),
            energy_score=float(value.get("energy_score", value.get("energyScore"))),
            onset_score=float(value.get("onset_score", value.get("onsetScore"))),
            spectral_flux_score=float(
                value.get("spectral_flux_score", value.get("spectralFluxScore"))
            ),
            silence_score=float(value.get("silence_score", value.get("silenceScore"))),
            fingerprint=str(value["fingerprint"]),
        )

    def _media_thumbnail_suggestion_from_dict(
        self,
        value: dict[str, Any],
    ) -> MediaThumbnailSuggestion:
        return MediaThumbnailSuggestion(
            id=str(value["id"]),
            image_path=str(value.get("image_path", value.get("imagePath"))),
            timestamp_seconds=float(
                value.get("timestamp_seconds", value.get("timestampSeconds"))
            ),
            score=float(value["score"]),
            activity_score=float(
                value.get("activity_score", value.get("activityScore"))
            ),
            brightness_score=float(
                value.get("brightness_score", value.get("brightnessScore"))
            ),
            contrast_score=float(
                value.get("contrast_score", value.get("contrastScore"))
            ),
            sharpness_score=float(
                value.get("sharpness_score", value.get("sharpnessScore"))
            ),
            note=str(value["note"]),
        )

    def _media_thumbnail_output_from_row(
        self,
        row: sqlite3.Row,
    ) -> MediaThumbnailOutput:
        payload = self._json_dict_from_text(row["payload_json"])
        return MediaThumbnailOutput(
            id=row["id"],
            asset_id=row["asset_id"],
            source_suggestion_id=row["source_suggestion_id"],
            image_path=str(payload.get("image_path", payload.get("imagePath"))),
            timestamp_seconds=float(
                payload.get("timestamp_seconds", payload.get("timestampSeconds"))
            ),
            score=float(payload["score"]),
            activity_score=float(
                payload.get("activity_score", payload.get("activityScore"))
            ),
            brightness_score=float(
                payload.get("brightness_score", payload.get("brightnessScore"))
            ),
            contrast_score=float(
                payload.get("contrast_score", payload.get("contrastScore"))
            ),
            sharpness_score=float(
                payload.get("sharpness_score", payload.get("sharpnessScore"))
            ),
            note=str(payload["note"]),
            position=int(row["position"]),
            selected_at=row["selected_at"],
        )

    def _media_index_artifact_summary_payload(
        self,
        artifact: MediaIndexArtifact,
    ) -> dict[str, Any]:
        return {
            "bucket_duration_seconds": artifact.bucket_duration_seconds,
            "duration_seconds": artifact.duration_seconds,
            "bucket_count": artifact.bucket_count,
            "confidence_score": artifact.confidence_score,
            "payload_byte_size": artifact.payload_byte_size,
            "energy_mean": artifact.energy_mean,
            "energy_peak": artifact.energy_peak,
            "onset_mean": artifact.onset_mean,
            "silence_share": artifact.silence_share,
            "sample_window_count": artifact.sample_window_count,
            "suggestion_count": len(artifact.thumbnail_suggestions),
            "note": artifact.note,
        }

    def _media_asset_index_artifact_summary(
        self,
        connection: sqlite3.Connection,
        asset_id: str,
    ) -> MediaIndexArtifactSummary | None:
        audio_row = connection.execute(
            """
            SELECT id, method, summary_json, updated_at
            FROM media_index_artifacts
            WHERE asset_id = ? AND kind = ?
            ORDER BY
              CASE method
                WHEN 'DECODED_AUDIO_FINGERPRINT_V1' THEN 0
                ELSE 1
              END,
              updated_at DESC,
              created_at DESC
            LIMIT 1
            """,
            (asset_id, MediaIndexArtifactKind.AUDIO_FINGERPRINT.value),
        ).fetchone()
        thumbnail_row = connection.execute(
            """
            SELECT id, method, summary_json, updated_at
            FROM media_index_artifacts
            WHERE asset_id = ? AND kind = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (asset_id, MediaIndexArtifactKind.THUMBNAIL_SUGGESTIONS.value),
        ).fetchone()
        if audio_row is None and thumbnail_row is None:
            return None

        summary = MediaIndexArtifactSummary()
        if audio_row is not None:
            summary_payload = self._json_dict_from_text(audio_row["summary_json"])
            summary.latest_audio_fingerprint_artifact_id = audio_row["id"]
            summary.audio_fingerprint_bucket_count = int(summary_payload.get("bucket_count", 0))
            summary.audio_fingerprint_method = MediaIndexArtifactMethod(audio_row["method"])
            summary.audio_fingerprint_updated_at = audio_row["updated_at"]
            summary.bucket_duration_seconds = (
                float(summary_payload["bucket_duration_seconds"])
                if summary_payload.get("bucket_duration_seconds") is not None
                else None
            )
            summary.confidence_score = (
                float(summary_payload["confidence_score"])
                if summary_payload.get("confidence_score") is not None
                else None
            )
        if thumbnail_row is not None:
            summary_payload = self._json_dict_from_text(thumbnail_row["summary_json"])
            summary.latest_thumbnail_suggestion_artifact_id = thumbnail_row["id"]
            summary.thumbnail_suggestion_count = int(summary_payload.get("suggestion_count", 0))
            summary.thumbnail_suggestion_method = MediaIndexArtifactMethod(
                thumbnail_row["method"]
            )
            summary.thumbnail_suggestion_updated_at = thumbnail_row["updated_at"]
        return summary

    def _media_asset_thumbnail_suggestion_set(
        self,
        connection: sqlite3.Connection,
        asset_id: str,
        source_path: str,
    ) -> MediaThumbnailSuggestionSet | None:
        row = connection.execute(
            """
            SELECT id, asset_id, job_id, kind, method, summary_json, payload_json,
                   created_at, updated_at
            FROM media_index_artifacts
            WHERE asset_id = ? AND kind = ?
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
            """,
            (asset_id, MediaIndexArtifactKind.THUMBNAIL_SUGGESTIONS.value),
        ).fetchone()
        if row is None:
            return None

        artifact = self._media_index_artifact_from_row(row)
        return MediaThumbnailSuggestionSet(
            method_version=artifact.method.value,
            generated_at=artifact.updated_at,
            source_path=source_path,
            sample_window_count=artifact.sample_window_count or 0,
            note=artifact.note,
            suggestions=artifact.thumbnail_suggestions,
        )

    def _media_asset_thumbnail_output_set(
        self,
        connection: sqlite3.Connection,
        asset_id: str,
    ) -> MediaThumbnailOutputSet | None:
        rows = connection.execute(
            """
            SELECT id, asset_id, source_suggestion_id, position, payload_json,
                   selected_at, updated_at
            FROM media_thumbnail_outputs
            WHERE asset_id = ?
            ORDER BY position ASC, updated_at DESC
            """,
            (asset_id,),
        ).fetchall()
        if not rows:
            return None

        outputs = [
            self._media_thumbnail_output_from_row(row)
            for row in rows
        ]
        updated_at = max(output.selected_at for output in outputs)
        return MediaThumbnailOutputSet(
            updated_at=updated_at,
            outputs=outputs,
        )

    def _json_dict_from_text(self, value: str | None) -> dict[str, Any]:
        if not value:
            return {}
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return payload if isinstance(payload, dict) else {}

    def _json_list_from_text(self, value: str | None) -> list[Any]:
        if not value:
            return []
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            return []
        return payload if isinstance(payload, list) else []

    def _media_library_asset_from_row(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> MediaLibraryAsset:
        source_type = ExampleClipSourceType(row["source_type"])
        source_value = row["source_value"]
        status = ExampleClipStatus(row["status"])
        status_detail = row["status_detail"]
        feature_summary = self._example_feature_summary_from_json(row["summary_json"])
        index_summary = self._media_index_summary_from_json(row["index_summary_json"])

        if source_type in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }:
            path = Path(source_value).expanduser()
            if not path.exists():
                status = ExampleClipStatus.MISSING_LOCAL_FILE
                status_detail = (
                    "Local media path was saved, but the file is not currently available on this machine."
                )
                feature_summary = None
                index_summary = None
                connection.execute(
                    """
                    UPDATE media_library_assets
                    SET status = ?, status_detail = ?, summary_json = NULL, index_summary_json = NULL
                    WHERE id = ?
                    """,
                    (
                        status.value,
                        status_detail,
                        row["id"],
                    ),
                )

        return MediaLibraryAsset(
            id=row["id"],
            asset_type=MediaLibraryAssetType(row["asset_type"]),
            scope=MediaLibraryAssetScope(row["scope"]),
            profile_id=row["profile_id"],
            source_type=source_type,
            source_value=source_value,
            title=row["title"],
            note=row["note"],
            status=status,
            status_detail=status_detail,
            feature_summary=feature_summary,
            index_summary=index_summary,
            index_artifact_summary=self._media_asset_index_artifact_summary(
                connection,
                row["id"],
            ),
            thumbnail_suggestion_set=self._media_asset_thumbnail_suggestion_set(
                connection,
                row["id"],
                source_value,
            ),
            thumbnail_output_set=self._media_asset_thumbnail_output_set(
                connection,
                row["id"],
            ),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _media_edit_pair_from_row(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> MediaEditPair:
        summary_payload: dict[str, Any] = {}
        if row["summary_json"]:
            try:
                parsed_summary = json.loads(row["summary_json"])
                if isinstance(parsed_summary, dict):
                    summary_payload = parsed_summary
            except json.JSONDecodeError:
                summary_payload = {}

        vod_asset = self._load_media_library_asset(connection, row["vod_asset_id"])
        edit_asset = self._load_media_library_asset(connection, row["edit_asset_id"])
        refreshed_summary = self._build_media_edit_pair_summary(vod_asset, edit_asset)
        self._append_confirmed_alignment_segments(
            connection,
            row["id"],
            refreshed_summary,
        )
        updated_at = row["updated_at"]
        if (
            summary_payload.get("status") != refreshed_summary["status"]
            or summary_payload.get("status_detail") != refreshed_summary["status_detail"]
            or summary_payload.get("source_duration_seconds") != refreshed_summary["source_duration_seconds"]
            or summary_payload.get("edit_duration_seconds") != refreshed_summary["edit_duration_seconds"]
            or summary_payload.get("kept_duration_seconds") != refreshed_summary["kept_duration_seconds"]
            or summary_payload.get("removed_duration_seconds") != refreshed_summary["removed_duration_seconds"]
            or summary_payload.get("keep_ratio") != refreshed_summary["keep_ratio"]
            or summary_payload.get("compression_ratio") != refreshed_summary["compression_ratio"]
            or summary_payload.get("alignment_segments") != refreshed_summary["alignment_segments"]
        ):
            updated_at = datetime.now(timezone.utc).isoformat()
            connection.execute(
                """
                UPDATE media_edit_pairs
                SET status = ?, status_detail = ?, summary_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    refreshed_summary["status"],
                    refreshed_summary["status_detail"],
                    self._to_json(refreshed_summary),
                    updated_at,
                    row["id"],
                ),
            )
            summary_payload = refreshed_summary

        return MediaEditPair(
            id=row["id"],
            vod_asset_id=row["vod_asset_id"],
            edit_asset_id=row["edit_asset_id"],
            profile_id=row["profile_id"],
            title=row["title"],
            note=row["note"],
            status=MediaEditPairStatus(summary_payload.get("status", row["status"])),
            status_detail=summary_payload.get("status_detail", row["status_detail"]),
            source_duration_seconds=summary_payload.get("source_duration_seconds"),
            edit_duration_seconds=summary_payload.get("edit_duration_seconds"),
            kept_duration_seconds=summary_payload.get("kept_duration_seconds"),
            removed_duration_seconds=summary_payload.get("removed_duration_seconds"),
            keep_ratio=summary_payload.get("keep_ratio"),
            compression_ratio=summary_payload.get("compression_ratio"),
            alignment_segments=[
                self._media_edit_alignment_segment_from_dict(segment)
                for segment in summary_payload.get("alignment_segments", [])
            ],
            created_at=row["created_at"],
            updated_at=updated_at,
        )

    def _media_edit_alignment_segment_from_dict(
        self,
        value: dict[str, Any],
    ) -> MediaEditAlignmentSegment:
        source_range = value.get("source_range") or value.get("sourceRange")
        edit_range = value.get("edit_range") or value.get("editRange")
        return MediaEditAlignmentSegment(
            id=value["id"],
            kind=MediaEditAlignmentKind(value["kind"]),
            method=MediaEditAlignmentMethod(value["method"]),
            source_range=self._time_range_from_dict(source_range) if source_range else None,
            edit_range=self._time_range_from_dict(edit_range) if edit_range else None,
            estimated_source_seconds=(
                float(value["estimated_source_seconds"])
                if value.get("estimated_source_seconds") is not None
                else float(value["estimatedSourceSeconds"])
                if value.get("estimatedSourceSeconds") is not None
                else None
            ),
            estimated_edit_seconds=(
                float(value["estimated_edit_seconds"])
                if value.get("estimated_edit_seconds") is not None
                else float(value["estimatedEditSeconds"])
                if value.get("estimatedEditSeconds") is not None
                else None
            ),
            confidence_score=float(
                value.get("confidence_score", value.get("confidenceScore", 0.0))
            ),
            note=value["note"],
        )

    # Local media boundary
    def _summarize_local_example(
        self,
        source_value: str,
    ) -> tuple[ExampleClipFeatureSummary | None, str]:
        try:
            feature_summary = build_local_example_feature_summary(
                source_value,
                Settings(),
            )
        except Exception as error:  # pragma: no cover - defensive local-media guard
            return (
                None,
                "Local clip file is present, but vaexcore pulse could not build a heuristic summary yet: "
                f"{error}",
            )

        return (
            feature_summary,
            "Local clip summary is ready for heuristic profile matching.",
        )

    def _build_media_edit_pair_summary(
        self,
        vod_asset: MediaLibraryAsset,
        edit_asset: MediaLibraryAsset,
    ) -> dict[str, Any]:
        source_duration_seconds = self._media_asset_duration_seconds(vod_asset)
        edit_duration_seconds = self._media_asset_duration_seconds(edit_asset)
        if source_duration_seconds is None or edit_duration_seconds is None:
            return {
                "status": MediaEditPairStatus.INCOMPLETE.value,
                "status_detail": (
                    "The VOD/edit connection is saved, but one or both media indexes "
                    "are still unavailable. Runtime-level keep/remove estimates will appear once both files index cleanly."
                ),
                "source_duration_seconds": source_duration_seconds,
                "edit_duration_seconds": edit_duration_seconds,
                "kept_duration_seconds": None,
                "removed_duration_seconds": None,
                "keep_ratio": None,
                "compression_ratio": None,
                "alignment_segments": [],
            }

        kept_duration_seconds = min(edit_duration_seconds, source_duration_seconds)
        removed_duration_seconds = max(source_duration_seconds - kept_duration_seconds, 0.0)
        keep_ratio = round(kept_duration_seconds / max(source_duration_seconds, 1.0), 4)
        compression_ratio = round(
            source_duration_seconds / max(edit_duration_seconds, 1.0),
            4,
        )

        return {
            "status": MediaEditPairStatus.READY.value,
            "status_detail": (
                "Paired source and edit registered. Pulse is showing runtime-based edit coverage now; "
                "confirmed keep ranges are added automatically when alignment jobs find matching audio fingerprints."
            ),
            "source_duration_seconds": round(source_duration_seconds, 2),
            "edit_duration_seconds": round(edit_duration_seconds, 2),
            "kept_duration_seconds": round(kept_duration_seconds, 2),
            "removed_duration_seconds": round(removed_duration_seconds, 2),
            "keep_ratio": keep_ratio,
            "compression_ratio": compression_ratio,
            "alignment_segments": self._build_provisional_alignment_segments(
                source_duration_seconds,
                edit_duration_seconds,
                kept_duration_seconds,
                removed_duration_seconds,
            ),
        }

    def _media_asset_duration_seconds(
        self,
        asset: MediaLibraryAsset,
    ) -> float | None:
        if asset.index_summary is not None:
            return asset.index_summary.duration_seconds
        if asset.feature_summary is not None:
            return asset.feature_summary.duration_seconds
        return None

    def _append_confirmed_alignment_segments(
        self,
        connection: sqlite3.Connection,
        pair_id: str,
        summary: dict[str, Any],
    ) -> None:
        rows = connection.execute(
            """
            SELECT id, job_id, pair_id, source_asset_id, query_asset_id, kind, method,
                   source_range_json, query_range_json, score, confidence_score,
                   matched_bucket_count, total_query_bucket_count, bucket_matches_json,
                   note, created_at, updated_at
            FROM media_alignment_matches
            WHERE pair_id = ? AND confidence_score >= ?
            ORDER BY confidence_score DESC, updated_at DESC
            LIMIT 5
            """,
            (pair_id, 0.55),
        ).fetchall()
        if not rows:
            return

        existing_segments = list(summary.get("alignment_segments", []))
        confirmed_segments = [
            self._convert(
                MediaEditAlignmentSegment(
                    id=f"alignment_{match.id}",
                    kind=MediaEditAlignmentKind.CONFIRMED_KEEP,
                    method=(
                        MediaEditAlignmentMethod.DECODED_AUDIO_ALIGNMENT
                        if match.method
                        == MediaAlignmentMethod.DECODED_AUDIO_BUCKET_CORRELATION_V1
                        else MediaEditAlignmentMethod.AUDIO_PROXY_ALIGNMENT
                    ),
                    source_range=match.source_range,
                    edit_range=match.query_range,
                    estimated_source_seconds=round(
                        match.source_range.end_seconds - match.source_range.start_seconds,
                        2,
                    ),
                    estimated_edit_seconds=round(
                        match.query_range.end_seconds - match.query_range.start_seconds,
                        2,
                    ),
                    confidence_score=match.confidence_score,
                    note=(
                        "Confirmed keep candidate from alignment job "
                        f"{match.job_id}. {match.note}"
                    ),
                )
            )
            for match in [self._media_alignment_match_from_row(row) for row in rows]
        ]
        summary["alignment_segments"] = confirmed_segments + existing_segments

    def _build_provisional_alignment_segments(
        self,
        source_duration_seconds: float,
        edit_duration_seconds: float,
        kept_duration_seconds: float,
        removed_duration_seconds: float,
    ) -> list[dict[str, Any]]:
        return [
            self._convert(
                MediaEditAlignmentSegment(
                    id="alignment_provisional_edit_keep",
                    kind=MediaEditAlignmentKind.PROVISIONAL_KEEP,
                    method=MediaEditAlignmentMethod.RUNTIME_PROPORTIONAL_ESTIMATE,
                    edit_range=TimeRange(
                        start_seconds=0.0,
                        end_seconds=round(edit_duration_seconds, 2),
                    ),
                    estimated_edit_seconds=round(edit_duration_seconds, 2),
                    estimated_source_seconds=round(kept_duration_seconds, 2),
                    confidence_score=0.15,
                    note=(
                        "The finished edit is known kept material. This segment records the edit runtime as a provisional kept region until an alignment job confirms source timestamps."
                    ),
                )
            ),
            self._convert(
                MediaEditAlignmentSegment(
                    id="alignment_provisional_removed_pool",
                    kind=MediaEditAlignmentKind.PROVISIONAL_REMOVED_POOL,
                    method=MediaEditAlignmentMethod.RUNTIME_PROPORTIONAL_ESTIMATE,
                    source_range=TimeRange(
                        start_seconds=0.0,
                        end_seconds=round(source_duration_seconds, 2),
                    ),
                    estimated_source_seconds=round(removed_duration_seconds, 2),
                    estimated_edit_seconds=0.0,
                    confidence_score=0.15,
                    note=(
                        "This is the estimated source material not represented by the final edit. It is a pool-level removed estimate that alignment jobs can refine."
                    ),
                )
            ),
        ]

    def _example_feature_summary_from_json(
        self,
        summary_json: str | None,
    ) -> ExampleClipFeatureSummary | None:
        if not summary_json:
            return None

        try:
            payload = json.loads(summary_json)
        except json.JSONDecodeError:
            return None

        return ExampleClipFeatureSummary(
            method_version=payload.get("method_version", "LOCAL_FILE_HEURISTIC_V1"),
            generated_at=payload["generated_at"],
            duration_seconds=float(payload["duration_seconds"]),
            transcript_chunk_count=int(payload["transcript_chunk_count"]),
            transcript_density_per_minute=float(payload["transcript_density_per_minute"]),
            candidate_seed_count=int(payload["candidate_seed_count"]),
            candidate_density_per_minute=float(payload["candidate_density_per_minute"]),
            transcript_anchor_terms=list(payload.get("transcript_anchor_terms", [])),
            transcript_anchor_phrases=list(payload.get("transcript_anchor_phrases", [])),
            speech_density_mean=float(payload["speech_density_mean"]),
            speech_density_peak=float(payload["speech_density_peak"]),
            energy_mean=float(payload["energy_mean"]),
            energy_peak=float(payload["energy_peak"]),
            pacing_mean=float(payload["pacing_mean"]),
            overlap_activity_mean=float(payload["overlap_activity_mean"]),
            high_activity_share=float(payload["high_activity_share"]),
            top_reason_codes=[
                ReasonCode(reason_code)
                for reason_code in payload.get("top_reason_codes", [])
            ],
            coverage_band=AnalysisCoverageBand(payload["coverage_band"]),
            coverage_flags=[
                AnalysisCoverageFlag(flag)
                for flag in payload.get("coverage_flags", [])
            ],
        )

    def _media_index_summary_from_json(
        self,
        summary_json: str | None,
    ) -> MediaIndexSummary | None:
        if not summary_json:
            return None

        try:
            payload = json.loads(summary_json)
        except json.JSONDecodeError:
            return None

        def get_value(snake_key: str, camel_key: str) -> Any:
            return payload.get(snake_key, payload.get(camel_key))

        return MediaIndexSummary(
            method_version=str(get_value("method_version", "methodVersion")),
            generated_at=str(get_value("generated_at", "generatedAt")),
            source_path=str(get_value("source_path", "sourcePath")),
            file_name=str(get_value("file_name", "fileName")),
            file_size_bytes=int(get_value("file_size_bytes", "fileSizeBytes") or 0),
            kind=str(payload["kind"]),
            format=str(payload["format"]),
            duration_seconds=float(
                get_value("duration_seconds", "durationSeconds") or 0.0
            ),
            frame_rate=(
                float(get_value("frame_rate", "frameRate"))
                if get_value("frame_rate", "frameRate") is not None
                else None
            ),
            width=(
                int(payload["width"])
                if payload.get("width") is not None
                else None
            ),
            height=(
                int(payload["height"])
                if payload.get("height") is not None
                else None
            ),
            video_codec=(
                str(get_value("video_codec", "videoCodec"))
                if get_value("video_codec", "videoCodec") is not None
                else None
            ),
            audio_codec=(
                str(get_value("audio_codec", "audioCodec"))
                if get_value("audio_codec", "audioCodec") is not None
                else None
            ),
            has_video=bool(get_value("has_video", "hasVideo")),
            has_audio=bool(get_value("has_audio", "hasAudio")),
            stream_count=int(get_value("stream_count", "streamCount") or 0),
            notes=list(payload.get("notes", [])),
        )

    def _generate_profile_id(self, name: str) -> str:
        base_slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "profile"
        candidate_id = f"profile_{base_slug}"
        if not self.profile_exists(candidate_id):
            return candidate_id
        return f"{candidate_id}_{uuid.uuid4().hex[:6]}"

    def _normalize_example_source_value(
        self,
        source_type: ExampleClipSourceType,
        source_value: str,
    ) -> str:
        if source_type in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }:
            return str(Path(source_value).expanduser())
        return source_value

    def _derive_example_status(
        self,
        source_type: ExampleClipSourceType,
        source_value: str,
    ) -> tuple[ExampleClipStatus, str | None]:
        if source_type in {
            ExampleClipSourceType.LOCAL_FILE_PATH,
            ExampleClipSourceType.LOCAL_FILE_UPLOAD,
        }:
            if Path(source_value).expanduser().exists():
                return (
                    ExampleClipStatus.LOCAL_FILE_AVAILABLE,
                    "Local clip reference saved. vaexcore pulse will try to prepare a local heuristic summary for matching.",
                )
            return (
                ExampleClipStatus.MISSING_LOCAL_FILE,
                "Local clip path was saved, but the file was not found on this machine at ingest time.",
            )

        return (
            ExampleClipStatus.REFERENCE_ONLY,
            "Remote clip retrieval is not enabled yet. vaexcore pulse is storing this reference for future matching work.",
        )

    def _refresh_session_summary(
        self,
        connection: sqlite3.Connection,
        project_session_id: str,
        updated_at: str,
    ) -> None:
        candidate_count_row = connection.execute(
            "SELECT COUNT(*) FROM candidate_windows WHERE project_session_id = ?",
            (project_session_id,),
        ).fetchone()
        accepted_count_row = connection.execute(
            """
            SELECT COUNT(*) FROM review_decisions
            WHERE project_session_id = ? AND action = 'ACCEPT'
            """,
            (project_session_id,),
        ).fetchone()
        rejected_count_row = connection.execute(
            """
            SELECT COUNT(*) FROM review_decisions
            WHERE project_session_id = ? AND action = 'REJECT'
            """,
            (project_session_id,),
        ).fetchone()
        deferred_count_row = connection.execute(
            """
            SELECT COUNT(*) FROM review_decisions
            WHERE project_session_id = ? AND action = 'DEFER'
            """,
            (project_session_id,),
        ).fetchone()
        candidate_count = int(candidate_count_row[0] if candidate_count_row else 0)
        accepted_count = int(accepted_count_row[0] if accepted_count_row else 0)
        rejected_count = int(rejected_count_row[0] if rejected_count_row else 0)
        deferred_count = int(deferred_count_row[0] if deferred_count_row else 0)
        existing_summary_row = connection.execute(
            "SELECT summary_json, session_json FROM project_sessions WHERE id = ?",
            (project_session_id,),
        ).fetchone()
        existing_summary_json = existing_summary_row[0] if existing_summary_row else None
        existing_session_json = existing_summary_row[1] if existing_summary_row else None
        connection.execute(
            """
            UPDATE project_sessions
            SET summary_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                self._to_json(
                    {
                        "status": "REVIEWING",
                        "analysis_coverage": self._analysis_coverage_summary_from_row(
                            existing_summary_json,
                            existing_session_json,
                        ),
                        "candidate_count": candidate_count,
                        "accepted_count": accepted_count,
                        "rejected_count": rejected_count,
                        "deferred_count": deferred_count,
                        "pending_count": max(
                            candidate_count
                            - accepted_count
                            - rejected_count
                            - deferred_count,
                            0,
                        ),
                    }
                ),
                updated_at,
                project_session_id,
            ),
        )

    def _load_base_session(self, row: sqlite3.Row) -> ProjectSession:
        session_json = row["session_json"]
        if session_json:
            session = self._project_session_from_dict(json.loads(session_json))
        else:
            session = analyze_media(
                row["media_path"],
                settings=self._settings_from_dict(json.loads(row["settings_json"])),
                profile_id=row["profile_id"],
                session_title=row["title"],
            )

        session.id = row["id"]
        session.title = row["title"]
        session.profile_id = row["profile_id"]
        session.created_at = row["created_at"]
        session.updated_at = row["updated_at"]
        return session

    def _load_review_decisions(
        self,
        connection: sqlite3.Connection,
        project_session_id: str,
    ) -> list[ReviewDecision]:
        rows = connection.execute(
            """
            SELECT id, project_session_id, candidate_id, action, label, adjusted_segment_json, notes, created_at
            FROM review_decisions
            WHERE project_session_id = ?
            ORDER BY created_at ASC
            """,
            (project_session_id,),
        ).fetchall()

        decisions: list[ReviewDecision] = []
        for row in rows:
            adjusted_segment = json.loads(row["adjusted_segment_json"]) if row["adjusted_segment_json"] else None
            decisions.append(
                ReviewDecision(
                    id=row["id"],
                    project_session_id=row["project_session_id"],
                    candidate_id=row["candidate_id"],
                    action=ReviewAction(row["action"]),
                    label=row["label"],
                    adjusted_segment=self._time_range_from_dict(adjusted_segment) if adjusted_segment else None,
                    notes=row["notes"],
                    created_at=row["created_at"],
                )
            )

        return decisions

    def _apply_review_state(
        self,
        session: ProjectSession,
        stored_updated_at: str,
    ) -> None:
        latest_updated_at = stored_updated_at
        decisions_by_candidate_id = {
            decision.candidate_id: decision for decision in session.review_decisions
        }

        for candidate in session.candidates:
            decision = decisions_by_candidate_id.get(candidate.id)
            if decision is None:
                continue

            if decision.label:
                candidate.editable_label = decision.label
            if decision.adjusted_segment:
                candidate.suggested_segment.start_seconds = (
                    decision.adjusted_segment.start_seconds
                )
                candidate.suggested_segment.end_seconds = (
                    decision.adjusted_segment.end_seconds
                )
            if decision.created_at > latest_updated_at:
                latest_updated_at = decision.created_at

        if session.review_decisions:
            session.status = "REVIEWING"
        session.updated_at = latest_updated_at

    def _project_session_from_dict(self, value: dict[str, Any]) -> ProjectSession:
        session = ProjectSession(
            id=value["id"],
            title=value["title"],
            status=value["status"],
            media_source=self._media_source_from_dict(value["media_source"]),
            profile_id=value["profile_id"],
            settings=self._settings_from_dict(value["settings"]),
            transcript=[
                self._transcript_chunk_from_dict(chunk)
                for chunk in value.get("transcript", [])
            ],
            speech_regions=[
                self._speech_region_from_dict(region)
                for region in value.get("speech_regions", [])
            ],
            feature_windows=[
                self._feature_window_from_dict(window)
                for window in value.get("feature_windows", [])
            ],
            candidates=[
                self._candidate_window_from_dict(candidate)
                for candidate in value.get("candidates", [])
            ],
            review_decisions=[
                self._review_decision_from_dict(decision)
                for decision in value.get("review_decisions", [])
            ],
            created_at=value["created_at"],
            updated_at=value["updated_at"],
            analysis_coverage=self._analysis_coverage_from_dict(
                value.get("analysis_coverage"),
            ),
            analysis_provenance=self._analysis_provenance_from_dict(
                value.get("analysis_provenance"),
            ),
        )
        if value.get("analysis_coverage") is None:
            session.analysis_coverage = self._derive_analysis_coverage(session)
        return session

    def _media_source_from_dict(self, value: dict[str, Any]) -> MediaSource:
        return MediaSource(
            id=value["id"],
            path=value["path"],
            kind=value["kind"],
            file_name=value["file_name"],
            duration_seconds=float(value["duration_seconds"]),
            format=value["format"],
            file_size_bytes=int(value.get("file_size_bytes", 0) or 0),
            frame_rate=float(value["frame_rate"]) if value.get("frame_rate") is not None else None,
            ingest_notes=list(value.get("ingest_notes", [])),
        )

    def _analysis_coverage_from_dict(
        self,
        value: dict[str, Any] | None,
    ) -> AnalysisCoverage:
        if not value:
            return AnalysisCoverage()

        try:
            band = AnalysisCoverageBand(
                value.get("band", AnalysisCoverageBand.PARTIAL.value)
            )
        except ValueError:
            band = AnalysisCoverageBand.PARTIAL

        flags: list[AnalysisCoverageFlag] = []
        for raw_flag in value.get("flags", []):
            try:
                flags.append(AnalysisCoverageFlag(raw_flag))
            except ValueError:
                continue

        return AnalysisCoverage(
            band=band,
            note=str(
                value.get("note", "Coverage note unavailable for this session.")
            ),
            flags=flags,
        )

    def _analysis_provenance_from_dict(
        self,
        value: dict[str, Any] | None,
    ) -> AnalysisProvenance:
        if not value:
            return AnalysisProvenance()

        try:
            state = AnalysisProvenanceState(
                value.get("state", AnalysisProvenanceState.PARTIAL.value)
            )
        except ValueError:
            state = AnalysisProvenanceState.PARTIAL

        return AnalysisProvenance(
            state=state,
            method_version=str(
                value.get("method_version", "pulse-local-analyzer-v1")
            ),
            transcript_source=str(value.get("transcript_source", "unknown")),
            audio_signal_source=str(value.get("audio_signal_source", "heuristic")),
            notes=[str(note) for note in value.get("notes", [])],
        )

    def _settings_from_dict(self, value: dict[str, Any]) -> Settings:
        return Settings(**value)

    def _transcript_chunk_from_dict(self, value: dict[str, Any]) -> TranscriptChunk:
        return TranscriptChunk(
            id=value["id"],
            start_seconds=float(value["start_seconds"]),
            end_seconds=float(value["end_seconds"]),
            text=value["text"],
            confidence=float(value["confidence"]) if value.get("confidence") is not None else None,
        )

    def _speech_region_from_dict(self, value: dict[str, Any]) -> SpeechRegion:
        return SpeechRegion(
            id=value["id"],
            start_seconds=float(value["start_seconds"]),
            end_seconds=float(value["end_seconds"]),
            speech_density=float(value["speech_density"]),
            overlap_activity=float(value["overlap_activity"]),
        )

    def _feature_window_from_dict(self, value: dict[str, Any]) -> FeatureWindow:
        return FeatureWindow(
            id=value["id"],
            start_seconds=float(value["start_seconds"]),
            end_seconds=float(value["end_seconds"]),
            rms_loudness=float(value["rms_loudness"]),
            onset_density=float(value["onset_density"]),
            spectral_contrast=float(value["spectral_contrast"]),
            zero_crossing_rate=float(value["zero_crossing_rate"]),
            speech_density=float(value["speech_density"]),
            overlap_activity=float(value["overlap_activity"]),
            laughter_like_burst=float(value["laughter_like_burst"]),
            pitch_excursion=float(value["pitch_excursion"]),
            abrupt_silence_after_intensity=float(value["abrupt_silence_after_intensity"]),
        )

    def _candidate_window_from_dict(self, value: dict[str, Any]) -> CandidateWindow:
        return CandidateWindow(
            id=value["id"],
            candidate_window=self._time_range_from_dict(value["candidate_window"]),
            suggested_segment=self._suggested_segment_from_dict(value["suggested_segment"]),
            confidence_band=ConfidenceBand(value["confidence_band"]),
            score_estimate=float(value["score_estimate"]),
            reason_codes=[
                ReasonCode(reason_code) for reason_code in value.get("reason_codes", [])
            ],
            transcript_snippet=value["transcript_snippet"],
            score_breakdown=[
                self._score_contribution_from_dict(item)
                for item in value.get("score_breakdown", [])
            ],
            context_required=bool(value.get("context_required", False)),
            editable_label=value["editable_label"],
            review_tags=[
                ReviewTag(review_tag) for review_tag in value.get("review_tags", [])
            ],
            profile_matches=[
                self._candidate_profile_match_from_dict(match)
                for match in value.get("profile_matches", [])
            ],
            rank_adjustment=float(
                value.get("rank_adjustment", value.get("rankAdjustment", 0)) or 0
            ),
            quality_signals={
                str(key): float(signal_value)
                for key, signal_value in value.get(
                    "quality_signals",
                    value.get("qualitySignals", {}),
                ).items()
                if isinstance(signal_value, (int, float))
            },
            duplicate_of_candidate_id=value.get(
                "duplicate_of_candidate_id",
                value.get("duplicateOfCandidateId"),
            ),
            near_duplicate_candidate_ids=[
                str(candidate_id)
                for candidate_id in value.get(
                    "near_duplicate_candidate_ids",
                    value.get("nearDuplicateCandidateIds", []),
                )
            ],
            edit_history=[
                self._candidate_edit_record_from_dict(record)
                for record in value.get("edit_history", value.get("editHistory", []))
            ],
        )

    def _candidate_edit_record_from_dict(
        self,
        value: dict[str, Any],
    ) -> CandidateEditRecord:
        return CandidateEditRecord(
            id=str(value["id"]),
            kind=str(value["kind"]),
            note=str(value.get("note", "")),
            source_candidate_ids=[
                str(candidate_id)
                for candidate_id in value.get(
                    "source_candidate_ids",
                    value.get("sourceCandidateIds", []),
                )
            ],
            created_at=str(value.get("created_at", value.get("createdAt", ""))),
        )

    def _score_contribution_from_dict(self, value: dict[str, Any]) -> ScoreContribution:
        return ScoreContribution(
            reason_code=ReasonCode(value["reason_code"]),
            label=value["label"],
            contribution=float(value["contribution"]),
            direction=value["direction"],
        )

    def _suggested_segment_from_dict(self, value: dict[str, Any]) -> SuggestedSegment:
        return SuggestedSegment(
            start_seconds=float(value["start_seconds"]),
            end_seconds=float(value["end_seconds"]),
            setup_padding_seconds=float(value["setup_padding_seconds"]),
            resolution_padding_seconds=float(value["resolution_padding_seconds"]),
            trim_dead_air_applied=bool(value["trim_dead_air_applied"]),
        )

    def _review_decision_from_dict(self, value: dict[str, Any]) -> ReviewDecision:
        adjusted_segment = value.get("adjusted_segment")
        return ReviewDecision(
            id=value["id"],
            project_session_id=value["project_session_id"],
            candidate_id=value["candidate_id"],
            action=ReviewAction(value["action"]),
            label=value.get("label"),
            adjusted_segment=self._time_range_from_dict(adjusted_segment) if adjusted_segment else None,
            notes=value.get("notes"),
            created_at=value["created_at"],
        )

    def _candidate_profile_match_from_dict(
        self,
        value: dict[str, Any],
    ) -> CandidateProfileMatch:
        return CandidateProfileMatch(
            profile_id=value["profile_id"],
            method=ProfileMatchingMethod(value.get("method", ProfileMatchingMethod.NONE.value)),
            status=CandidateProfileMatchStatus(value["status"]),
            strength=CandidateProfileMatchStrength(value["strength"]),
            note=value["note"],
            matched_example_clip_ids=list(value.get("matched_example_clip_ids", [])),
            compared_example_count=int(value.get("compared_example_count", 0)),
            supporting_factors=list(value.get("supporting_factors", [])),
            limiting_factors=list(value.get("limiting_factors", [])),
            similarity_score=float(value["similarity_score"])
            if value.get("similarity_score") is not None
            else None,
            updated_at=value.get("updated_at"),
        )

    def _time_range_from_dict(self, value: dict[str, Any]) -> TimeRange:
        return TimeRange(
            start_seconds=float(value.get("start_seconds", value.get("startSeconds"))),
            end_seconds=float(value.get("end_seconds", value.get("endSeconds"))),
        )

    def _status_from_summary_json(self, summary_json: str | None) -> str:
        if not summary_json:
            return "READY"

        try:
            payload = json.loads(summary_json)
        except json.JSONDecodeError:
            return "READY"

        status = payload.get("status")
        return status if isinstance(status, str) else "READY"

    def _analysis_coverage_summary_from_row(
        self,
        summary_json: str | None,
        session_json: str | None,
    ) -> dict[str, Any]:
        summary_payload: dict[str, Any] | None = None
        if summary_json:
            try:
                parsed_summary = json.loads(summary_json)
                if isinstance(parsed_summary, dict):
                    summary_payload = parsed_summary
            except json.JSONDecodeError:
                summary_payload = None

        summary_coverage = None
        if summary_payload:
            summary_coverage = summary_payload.get(
                "analysis_coverage",
                summary_payload.get("analysisCoverage"),
            )

        if isinstance(summary_coverage, dict):
            return self._convert(self._analysis_coverage_from_dict(summary_coverage))

        if session_json:
            try:
                parsed_session = json.loads(session_json)
                if isinstance(parsed_session, dict):
                    session = self._project_session_from_dict(parsed_session)
                    return self._convert(session.analysis_coverage)
            except json.JSONDecodeError:
                pass

        return self._convert(AnalysisCoverage())

    def _derive_analysis_coverage(self, session: ProjectSession) -> AnalysisCoverage:
        return build_analysis_coverage(
            session.media_source,
            session.transcript,
            session.candidates,
            session.settings,
        )

    def _ensure_column(
        self,
        connection: sqlite3.Connection,
        table_name: str,
        column_name: str,
        definition: str,
    ) -> None:
        existing_columns = {
            row[1]
            for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name in existing_columns:
            return

        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
        )

    def _ensure_media_library_asset_columns(
        self,
        connection: sqlite3.Connection,
    ) -> None:
        self._ensure_column(
            connection,
            "media_library_assets",
            "index_summary_json",
            "TEXT",
        )

    def _to_json(self, value: Any) -> str:
        return json.dumps(self._convert(value), indent=2)

    def _convert(self, value: Any) -> Any:
        if isinstance(value, Enum):
            return value.value
        if is_dataclass(value):
            return {
                key: self._convert(inner_value)
                for key, inner_value in asdict(value).items()
            }
        if isinstance(value, dict):
            return {
                key: self._convert(inner_value)
                for key, inner_value in value.items()
            }
        if isinstance(value, list):
            return [self._convert(item) for item in value]
        return value
