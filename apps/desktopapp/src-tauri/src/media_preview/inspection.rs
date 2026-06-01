#[tauri::command]
pub(crate) fn inspect_media_playback(
    media_path: String,
) -> Result<MediaPlaybackInspection, String> {
    let path = Path::new(&media_path);
    if !path.exists() {
        return Ok(MediaPlaybackInspection {
            path_exists: false,
            readable: false,
            file_size_bytes: None,
            ffprobe_available: false,
            probe_succeeded: false,
            format_name: None,
            video_codec: None,
            audio_codec: None,
            detail: format!("Pulse could not find this file: {}", media_path),
        });
    }

    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let readable = File::open(path).is_ok();
    if !readable {
        return Ok(MediaPlaybackInspection {
            path_exists: true,
            readable: false,
            file_size_bytes: Some(metadata.len()),
            ffprobe_available: false,
            probe_succeeded: false,
            format_name: None,
            video_codec: None,
            audio_codec: None,
            detail: format!(
                "macOS did not allow Pulse to read this file: {}",
                media_path
            ),
        });
    }

    let Some(ffprobe) = find_executable(
        "ffprobe",
        &[
            "C:\\ffmpeg\\bin\\ffprobe.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe",
            "/opt/homebrew/bin/ffprobe",
            "/usr/local/bin/ffprobe",
            "/usr/bin/ffprobe",
        ],
    ) else {
        return Ok(MediaPlaybackInspection {
            path_exists: true,
            readable,
            file_size_bytes: Some(metadata.len()),
            ffprobe_available: false,
            probe_succeeded: false,
            format_name: None,
            video_codec: None,
            audio_codec: None,
            detail: "The file is available, but Pulse could not find ffprobe to inspect it."
                .to_string(),
        });
    };

    let mut ffprobe_command = Command::new(ffprobe);
    suppress_windows_console(&mut ffprobe_command);
    let ffprobe_output = ffprobe_command
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=format_name",
            "-show_entries",
            "stream=codec_type,codec_name",
            "-of",
            "json",
            &media_path,
        ])
        .output();

    let output = match ffprobe_output {
        Ok(output) => output,
        Err(error) => {
            let detail = if error.kind() == std::io::ErrorKind::NotFound {
                "The file is available, but Pulse could not inspect it.".to_string()
            } else {
                format!(
                    "The file is available, but Pulse could not inspect it: {}",
                    error
                )
            };

            return Ok(MediaPlaybackInspection {
                path_exists: true,
                readable,
                file_size_bytes: Some(metadata.len()),
                ffprobe_available: false,
                probe_succeeded: false,
                format_name: None,
                video_codec: None,
                audio_codec: None,
                detail,
            });
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Ok(MediaPlaybackInspection {
            path_exists: true,
            readable,
            file_size_bytes: Some(metadata.len()),
            ffprobe_available: true,
            probe_succeeded: false,
            format_name: None,
            video_codec: None,
            audio_codec: None,
            detail: if stderr.is_empty() {
                "The file is available, but Pulse could not read it as a video.".to_string()
            } else {
                format!(
                    "The file is available, but Pulse could not read it as a video: {}",
                    stderr
                )
            },
        });
    }

    let parsed = serde_json::from_slice::<serde_json::Value>(&output.stdout)
        .map_err(|error| error.to_string())?;
    let streams = parsed
        .get("streams")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let format_name = parsed
        .get("format")
        .and_then(|value| value.get("format_name"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);
    let video_codec = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(|value| value.as_str()) == Some("video"))
        .and_then(|stream| stream.get("codec_name"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);
    let audio_codec = streams
        .iter()
        .find(|stream| stream.get("codec_type").and_then(|value| value.as_str()) == Some("audio"))
        .and_then(|stream| stream.get("codec_name"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned);

    let detail = match (video_codec.as_deref(), audio_codec.as_deref()) {
        (Some("h264"), Some("aac")) => "The file is available and should be playable.".to_string(),
        (Some(_), Some(_)) => {
            "The file is available, but this video format may not preview correctly.".to_string()
        }
        (Some(_), None) => "The file is available, but it may not include audio.".to_string(),
        _ => "The file is available, but Pulse could not confirm the video format.".to_string(),
    };

    Ok(MediaPlaybackInspection {
        path_exists: true,
        readable,
        file_size_bytes: Some(metadata.len()),
        ffprobe_available: true,
        probe_succeeded: true,
        format_name,
        video_codec,
        audio_codec,
        detail,
    })
}
