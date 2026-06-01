#[tauri::command]
pub(crate) fn open_media_in_quicktime(
    media_path: String,
    start_seconds: Option<f64>,
) -> Result<String, String> {
    if !Path::new(&media_path).exists() {
        return Err(format!("File not found: {}", media_path));
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &media_path]);
        suppress_windows_console(&mut command);
        let status = command
            .status()
            .map_err(|error| format!("Could not open this file with the Windows shell: {error}"))?;
        return if status.success() {
            Ok("Opened this file with the default Windows media app. Timestamp seeking is not automatic on Windows yet.".to_string())
        } else {
            Err("Could not open this file with the default Windows media app.".to_string())
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        let normalized_seconds = start_seconds.unwrap_or(0.0).max(0.0);
        let escaped_path = media_path.replace('\\', "\\\\").replace('"', "\\\"");
        let apple_script = format!(
            r#"
set targetFile to POSIX file "{escaped_path}"
set targetTime to {normalized_seconds}
tell application "QuickTime Player"
  activate
  open targetFile
  repeat 50 times
    try
      set current time of front document to targetTime
      exit repeat
    on error
      delay 0.1
    end try
  end repeat
end tell
"#,
        );

        let script_status = Command::new("osascript")
            .arg("-e")
            .arg(apple_script)
            .output();

        match script_status {
            Ok(output) if output.status.success() => {
                Ok("Opened this file in QuickTime and jumped to the requested moment.".to_string())
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let fallback = Command::new("open")
                    .args(["-a", "QuickTime Player", &media_path])
                    .status()
                    .map_err(|error| error.to_string())?;
                if fallback.success() {
                    if stderr.is_empty() {
                        Ok("Opened this file in QuickTime, but could not jump to the exact timestamp automatically.".to_string())
                    } else {
                        Ok(format!(
                        "Opened this file in QuickTime, but could not jump to the exact timestamp automatically: {}",
                        stderr
                    ))
                    }
                } else {
                    Err("Could not open this file in QuickTime.".to_string())
                }
            }
            Err(error) => Err(format!("Could not open QuickTime: {}", error)),
        }
    }
}
