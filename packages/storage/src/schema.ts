export const sqliteSchemaVersion = 7;

export const sqliteTables = [
  "project_sessions",
  "candidate_windows",
  "review_decisions",
  "analysis_artifacts",
  "clip_profiles",
  "example_clips",
  "media_library_assets",
  "media_index_jobs",
  "media_index_artifacts",
  "media_thumbnail_outputs",
  "media_alignment_jobs",
  "media_alignment_matches",
  "media_edit_pairs",
] as const;

export const initialMigrationSql = `
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
`;
export const migrationPlaceholders = [
  "001_initial_schema.sql",
  "002_review_feedback_indexes.sql",
  "003_profile_preferences.sql",
  "004_clip_profiles.sql",
  "005_media_library_assets.sql",
] as const;
