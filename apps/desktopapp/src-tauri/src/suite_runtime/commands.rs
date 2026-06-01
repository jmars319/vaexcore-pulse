#[tauri::command]
pub(crate) fn launch_vaexcore_suite() -> Vec<SuiteLaunchResult> {
    VAEXCORE_SUITE_APPS
        .iter()
        .map(|app_name| launch_desktop_app(app_name))
        .collect()
}

#[tauri::command]
pub(crate) fn suite_status() -> Vec<SuiteAppStatus> {
    suite_app_definitions()
        .iter()
        .map(suite_app_status)
        .collect()
}

#[tauri::command]
pub(crate) fn suite_session() -> Option<SuiteSessionDocument> {
    read_suite_session_document()
}

#[tauri::command]
pub(crate) fn suite_timeline(limit: Option<usize>) -> Vec<SuiteTimelineEvent> {
    read_suite_timeline_events(limit.unwrap_or(50))
}

#[tauri::command]
pub(crate) fn append_suite_timeline(input: SuiteTimelineInput) -> Result<(), String> {
    append_suite_timeline_event(&input.kind, &input.title, &input.detail, input.metadata)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn consume_pulse_recording_handoff() -> Option<PulseRecordingHandoffDocument> {
    let path = suite_handoff_dir().join(PULSE_RECORDING_INTAKE_FILE);
    consume_pulse_recording_handoff_file(&path, true)
}

fn consume_pulse_recording_handoff_file(
    path: &Path,
    append_timeline: bool,
) -> Option<PulseRecordingHandoffDocument> {
    let contents = fs::read(path).ok()?;
    let handoff = serde_json::from_slice::<PulseRecordingHandoffDocument>(&contents).ok()?;
    if let Err(error) = validate_pulse_recording_handoff(&handoff, path) {
        eprintln!("Ignoring invalid vaexcore pulse recording handoff: {error}");
        let _ = fs::remove_file(path);
        return None;
    }
    let _ = fs::remove_file(path);
    if append_timeline {
        if let Err(error) = append_suite_timeline_event(
            "recording.handoff",
            "Pulse received recording",
            &format!(
                "{} sent {} for review.",
                handoff.source_app_name, handoff.recording.output_path
            ),
            serde_json::json!({
                "requestId": handoff.request_id,
                "sessionId": handoff.recording.session_id,
                "outputPath": handoff.recording.output_path,
                "captureMode": handoff.recording.capture_mode,
                "captureDetail": handoff.recording.capture_detail,
                "outputReady": handoff.output_ready,
            }),
        ) {
            eprintln!("Unable to append vaexcore pulse suite timeline event: {error}");
        }
    }
    Some(handoff)
}

fn validate_pulse_recording_handoff(
    handoff: &PulseRecordingHandoffDocument,
    path: &Path,
) -> Result<(), String> {
    let file_age = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok());
    validate_pulse_recording_handoff_document(handoff, file_age)
}

fn validate_pulse_recording_handoff_document(
    handoff: &PulseRecordingHandoffDocument,
    file_age: Option<Duration>,
) -> Result<(), String> {
    if handoff.schema_version != SUITE_DISCOVERY_SCHEMA_VERSION {
        return Err(format!(
            "expected schema version {}, got {}",
            SUITE_DISCOVERY_SCHEMA_VERSION, handoff.schema_version
        ));
    }
    if handoff.source_app != STUDIO_APP_ID {
        return Err(format!("unexpected source app {}", handoff.source_app));
    }
    if handoff.target_app != PULSE_APP_ID {
        return Err(format!("unexpected target app {}", handoff.target_app));
    }
    if handoff.request_id.trim().is_empty() {
        return Err("requestId is required".to_string());
    }
    if !looks_like_rfc3339_timestamp(&handoff.requested_at) {
        return Err("requestedAt must be an RFC3339-like timestamp".to_string());
    }
    if handoff.recording.session_id.trim().is_empty() {
        return Err("recording.sessionId is required".to_string());
    }
    if handoff.recording.output_path.trim().is_empty() {
        return Err("recording.outputPath is required".to_string());
    }
    if !looks_like_rfc3339_timestamp(&handoff.recording.stopped_at) {
        return Err("recording.stoppedAt must be an RFC3339-like timestamp".to_string());
    }
    if let Some(output_ready) = &handoff.output_ready {
        validate_pulse_recording_handoff_output_ready(output_ready)?;
    }
    if let Some(age) = file_age {
        if age > PULSE_HANDOFF_STALE_AFTER {
            return Err(format!("handoff file is stale: {}s old", age.as_secs()));
        }
    }
    Ok(())
}

fn validate_pulse_recording_handoff_output_ready(
    output_ready: &PulseRecordingHandoffOutputReady,
) -> Result<(), String> {
    let state = output_ready.state.trim();
    if !matches!(state, "ready" | "degraded" | "blocked" | "not_applicable") {
        return Err("outputReady.state is invalid".to_string());
    }
    if output_ready.detail.trim().is_empty() {
        return Err("outputReady.detail is required".to_string());
    }
    if output_ready.ready && state != "ready" {
        return Err("outputReady.ready requires state ready".to_string());
    }
    if !output_ready.ready && state == "ready" {
        return Err("outputReady.state ready requires ready true".to_string());
    }
    if output_ready.ready && !output_ready.blockers.is_empty() {
        return Err("outputReady.ready cannot include blockers".to_string());
    }
    if output_ready
        .blockers
        .iter()
        .chain(output_ready.warnings.iter())
        .any(|item| item.trim().is_empty())
    {
        return Err("outputReady blockers and warnings cannot be empty".to_string());
    }
    Ok(())
}

fn looks_like_rfc3339_timestamp(value: &str) -> bool {
    let trimmed = value.trim();
    let Some((date, time)) = trimmed.split_once('T') else {
        return false;
    };
    let date_bytes = date.as_bytes();
    let time_bytes = time.as_bytes();
    if date_bytes.len() != 10
        || date_bytes[4] != b'-'
        || date_bytes[7] != b'-'
        || !date_bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return false;
    }
    if time_bytes.len() < 9
        || time_bytes[2] != b':'
        || time_bytes[5] != b':'
        || ![0, 1, 3, 4, 6, 7]
            .iter()
            .all(|index| time_bytes[*index].is_ascii_digit())
    {
        return false;
    }
    time.ends_with('Z') || time[8..].contains('+') || time[8..].contains('-')
}

#[tauri::command]
pub(crate) fn consume_suite_commands() -> Vec<SuiteCommandDocument> {
    let directory = suite_command_dir().join(PULSE_APP_ID);
    consume_suite_commands_from_dir(&directory, true)
}

fn consume_suite_commands_from_dir(
    directory: &Path,
    append_timeline: bool,
) -> Vec<SuiteCommandDocument> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };

    let mut commands = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let contents = fs::read(&path).ok()?;
            let command = serde_json::from_slice::<SuiteCommandDocument>(&contents).ok()?;
            if let Err(error) = validate_suite_command(&command, &path) {
                eprintln!("Ignoring invalid vaexcore pulse suite command: {error}");
                let _ = fs::remove_file(path);
                return None;
            }
            let _ = fs::remove_file(path);
            if append_timeline {
                if let Err(error) = append_suite_timeline_event(
                    "suite.command",
                    "Pulse consumed suite command",
                    &format!(
                        "Handled {} from {}.",
                        command.command, command.source_app_name
                    ),
                    serde_json::json!({
                        "commandId": command.command_id,
                        "command": command.command,
                        "sourceApp": command.source_app,
                    }),
                ) {
                    eprintln!("Unable to append vaexcore pulse suite timeline event: {error}");
                }
            }
            Some(command)
        })
        .collect::<Vec<_>>();
    commands.sort_by(|left, right| left.requested_at.cmp(&right.requested_at));
    commands
}

fn validate_suite_command(command: &SuiteCommandDocument, path: &Path) -> Result<(), String> {
    let file_age = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok());
    validate_suite_command_document(command, file_age)
}

fn validate_suite_command_document(
    command: &SuiteCommandDocument,
    file_age: Option<Duration>,
) -> Result<(), String> {
    if command.schema_version != SUITE_DISCOVERY_SCHEMA_VERSION {
        return Err(format!(
            "expected schema version {}, got {}",
            SUITE_DISCOVERY_SCHEMA_VERSION, command.schema_version
        ));
    }
    if command.target_app != PULSE_APP_ID {
        return Err(format!("unexpected target app {}", command.target_app));
    }
    if !suite_app_definitions()
        .iter()
        .any(|definition| definition.app_id == command.source_app)
    {
        return Err(format!("unknown source app {}", command.source_app));
    }
    if command.command_id.trim().is_empty() {
        return Err("commandId is required".to_string());
    }
    if command.command.trim().is_empty() {
        return Err("command is required".to_string());
    }
    if !looks_like_rfc3339_timestamp(&command.requested_at) {
        return Err("requestedAt must be an RFC3339-like timestamp".to_string());
    }
    if !command.payload.is_object() {
        return Err("payload must be an object".to_string());
    }
    if let Some(age) = file_age {
        if age > SUITE_COMMAND_STALE_AFTER {
            return Err(format!("command file is stale: {}s old", age.as_secs()));
        }
    }
    Ok(())
}

fn launch_desktop_app(app_name: &str) -> SuiteLaunchResult {
    if app_name == APP_NAME {
        return SuiteLaunchResult {
            app_name: app_name.to_string(),
            ok: true,
            detail: format!("{APP_NAME} is already running."),
        };
    }

    #[cfg(target_os = "macos")]
    {
        match Command::new("open").args(["-a", app_name]).output() {
            Ok(output) if output.status.success() => SuiteLaunchResult {
                app_name: app_name.to_string(),
                ok: true,
                detail: "Launch requested.".to_string(),
            },
            Ok(output) => {
                let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                SuiteLaunchResult {
                    app_name: app_name.to_string(),
                    ok: false,
                    detail: if detail.is_empty() {
                        format!("open exited with status {}.", output.status)
                    } else {
                        detail
                    },
                }
            }
            Err(error) => SuiteLaunchResult {
                app_name: app_name.to_string(),
                ok: false,
                detail: error.to_string(),
            },
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(executable_path) = windows_app_executable_path(app_name) {
            let mut command = Command::new(&executable_path);
            suppress_windows_console(&mut command);
            return match command.spawn() {
                Ok(_) => SuiteLaunchResult {
                    app_name: app_name.to_string(),
                    ok: true,
                    detail: format!("Launch requested: {}.", executable_path.display()),
                },
                Err(error) => SuiteLaunchResult {
                    app_name: app_name.to_string(),
                    ok: false,
                    detail: error.to_string(),
                },
            };
        }

        SuiteLaunchResult {
            app_name: app_name.to_string(),
            ok: false,
            detail: format!(
                "Could not find {app_name}. Install it with the Windows installer or place it in a standard vaexcore install folder."
            ),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        SuiteLaunchResult {
            app_name: app_name.to_string(),
            ok: false,
            detail: "Launch Suite is not available on this platform.".to_string(),
        }
    }
}
