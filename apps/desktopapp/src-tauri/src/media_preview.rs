use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, SystemTime};

use crate::local_services::{find_executable, suppress_windows_console};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaPlaybackInspection {
    path_exists: bool,
    readable: bool,
    file_size_bytes: Option<u64>,
    ffprobe_available: bool,
    probe_succeeded: bool,
    format_name: Option<String>,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedMediaPreview {
    preview_path: String,
    reused_existing: bool,
    file_size_bytes: Option<u64>,
    duration_seconds: f64,
    detail: String,
}

include!("media_preview/inspection.rs");
include!("media_preview/preview_clip.rs");
include!("media_preview/open_media.rs");
include!("media_preview/cache.rs");
