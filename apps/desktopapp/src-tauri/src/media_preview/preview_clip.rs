#[tauri::command]
pub(crate) fn prepare_media_preview_clip(
    media_path: String,
    start_seconds: f64,
    end_seconds: f64,
) -> Result<PreparedMediaPreview, String> {
    let path = Path::new(&media_path);
    if !path.exists() {
        return Err(format!("File not found: {}", media_path));
    }

    if File::open(path).is_err() {
        return Err(format!(
            "Pulse could not read this video to prepare a preview: {}",
            media_path
        ));
    }

    let ffmpeg = find_executable(
        "ffmpeg",
        &[
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ],
    )
    .ok_or_else(|| "Pulse could not prepare a video preview.".to_string())?;

    let mut ffmpeg_version = Command::new(&ffmpeg);
    suppress_windows_console(&mut ffmpeg_version);
    match ffmpeg_version.arg("-version").output() {
        Ok(output) if output.status.success() => {}
        Ok(_) => return Err("Pulse could not prepare a video preview.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err("Pulse could not prepare a video preview.".to_string())
        }
        Err(error) => {
            return Err(format!(
                "Pulse could not prepare a video preview: {}",
                error
            ))
        }
    }

    let normalized_start_seconds = start_seconds.max(0.0);
    let normalized_end_seconds = end_seconds.max(normalized_start_seconds + 0.2);
    let clip_duration_seconds = (normalized_end_seconds - normalized_start_seconds).max(0.2);
    let cache_dir = preview_cache_dir();
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    cleanup_old_preview_clips(&cache_dir);

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_epoch_seconds = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    media_path.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    modified_epoch_seconds.hash(&mut hasher);
    format!(
        "{:.3}:{:.3}",
        normalized_start_seconds, normalized_end_seconds
    )
    .hash(&mut hasher);

    let cache_key = hasher.finish();
    let preview_stem = sanitize_file_stem(
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("moment-preview"),
    );
    let preview_path = cache_dir.join(format!("{}-{:016x}.mp4", preview_stem, cache_key));

    if preview_path.exists() {
        let existing_metadata = fs::metadata(&preview_path).map_err(|error| error.to_string())?;
        if existing_metadata.len() > 0 {
            return Ok(PreparedMediaPreview {
                preview_path: preview_path.to_string_lossy().to_string(),
                reused_existing: true,
                file_size_bytes: Some(existing_metadata.len()),
                duration_seconds: clip_duration_seconds,
                detail: "Pulse reused an existing preview for this moment.".to_string(),
            });
        }

        let _ = fs::remove_file(&preview_path);
    }

    let mut ffmpeg_command = Command::new(ffmpeg);
    suppress_windows_console(&mut ffmpeg_command);
    let ffmpeg_output = ffmpeg_command
        .args([
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-ss",
            &format!("{:.3}", normalized_start_seconds),
            "-t",
            &format!("{:.3}", clip_duration_seconds),
            "-i",
            &media_path,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "30",
            "-vf",
            "scale=1280:-2:force_original_aspect_ratio=decrease,fps=30",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            preview_path
                .to_str()
                .ok_or_else(|| "Pulse could not prepare a video preview.".to_string())?,
        ])
        .output()
        .map_err(|error| format!("Pulse could not prepare a video preview: {}", error))?;

    if !ffmpeg_output.status.success() {
        let _ = fs::remove_file(&preview_path);
        let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr)
            .trim()
            .to_string();
        if stderr.is_empty() {
            return Err("Pulse could not prepare a preview for this moment.".to_string());
        }

        return Err(format!(
            "Pulse could not prepare a preview for this moment: {}",
            stderr
        ));
    }

    let preview_metadata = fs::metadata(&preview_path).map_err(|error| error.to_string())?;

    Ok(PreparedMediaPreview {
        preview_path: preview_path.to_string_lossy().to_string(),
        reused_existing: false,
        file_size_bytes: Some(preview_metadata.len()),
        duration_seconds: clip_duration_seconds,
        detail: "Pulse prepared a preview for this moment.".to_string(),
    })
}
