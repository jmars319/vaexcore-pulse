use serde::Serialize;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime};

use crate::local_services::{
    find_executable, helper_service_bundle_detail, helper_service_bundle_state, port_is_open,
    ANALYZER_PORT, API_PORT,
};
use crate::platform_paths::{app_data_dir_for, vaexcore_shared_data_dir};
use crate::suite_protocol::{
    SuiteAppDefinition, PULSE_APP_ID, PULSE_RECORDING_INTAKE_FILE, STUDIO_APP_ID,
    SUITE_APP_DEFINITIONS, SUITE_DISCOVERY_SCHEMA_VERSION, VAEXCORE_SUITE_APPS,
};
use crate::APP_NAME;

const SUITE_DISCOVERY_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const PULSE_HANDOFF_STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);
const SUITE_COMMAND_STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteLaunchResult {
    pub(crate) app_name: String,
    pub(crate) ok: bool,
    pub(crate) detail: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteDiscoveryDocument {
    schema_version: u8,
    app_id: String,
    app_name: String,
    bundle_identifier: String,
    version: String,
    pid: u32,
    started_at: String,
    updated_at: String,
    api_url: Option<String>,
    ws_url: Option<String>,
    health_url: Option<String>,
    capabilities: Vec<String>,
    launch_name: String,
    suite_session_id: Option<String>,
    activity: Option<String>,
    activity_detail: Option<String>,
    local_runtime: Option<SuiteLocalRuntime>,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteLocalRuntime {
    contract_version: u8,
    mode: String,
    state: String,
    app_storage_dir: String,
    suite_dir: String,
    secure_storage: String,
    secret_storage_state: String,
    durable_storage: Vec<String>,
    network_policy: String,
    dependencies: Vec<SuiteLocalRuntimeDependency>,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteLocalRuntimeDependency {
    name: String,
    kind: String,
    state: String,
    detail: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteSessionDocument {
    schema_version: u8,
    session_id: String,
    title: String,
    status: String,
    owner_app: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteCommandDocument {
    schema_version: u8,
    command_id: String,
    source_app: String,
    source_app_name: String,
    target_app: String,
    command: String,
    requested_at: String,
    payload: serde_json::Value,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteTimelineEvent {
    schema_version: u8,
    event_id: String,
    source_app: String,
    source_app_name: String,
    kind: String,
    title: String,
    detail: String,
    created_at: String,
    metadata: serde_json::Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteAppStatus {
    app_id: String,
    app_name: String,
    launch_name: String,
    bundle_identifier: String,
    installed: bool,
    running: bool,
    reachable: bool,
    stale: bool,
    discovery_file: String,
    pid: Option<u32>,
    api_url: Option<String>,
    health_url: Option<String>,
    updated_at: Option<String>,
    capabilities: Vec<String>,
    suite_session_id: Option<String>,
    activity: Option<String>,
    activity_detail: Option<String>,
    local_runtime: Option<SuiteLocalRuntime>,
    detail: String,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SuiteTimelineInput {
    kind: String,
    title: String,
    detail: String,
    metadata: serde_json::Value,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PulseRecordingHandoffDocument {
    schema_version: u8,
    request_id: String,
    source_app: String,
    source_app_name: String,
    target_app: String,
    requested_at: String,
    recording: PulseRecordingHandoffRecording,
    #[serde(default)]
    output_ready: Option<PulseRecordingHandoffOutputReady>,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PulseRecordingHandoffRecording {
    session_id: String,
    output_path: String,
    profile_id: Option<String>,
    profile_name: Option<String>,
    #[serde(default)]
    capture_mode: Option<String>,
    #[serde(default)]
    capture_detail: Option<String>,
    stopped_at: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PulseRecordingHandoffOutputReady {
    ready: bool,
    state: String,
    detail: String,
    active_scene_id: Option<String>,
    active_scene_name: Option<String>,
    program_preview_frame_ready: Option<bool>,
    compositor_render_plan_ready: Option<bool>,
    output_preflight_ready: Option<bool>,
    media_pipeline_ready: Option<bool>,
    #[serde(default)]
    blockers: Vec<String>,
    #[serde(default)]
    warnings: Vec<String>,
}

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
            detail: "Launch Suite is not implemented on this platform.".to_string(),
        }
    }
}

pub(crate) fn start_suite_discovery_heartbeat(app_data_dir: Option<PathBuf>) {
    let started_at = suite_timestamp();

    thread::spawn(move || loop {
        let api_url = format!("http://127.0.0.1:{API_PORT}");
        let session = read_suite_session_document();
        let document = SuiteDiscoveryDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            app_id: PULSE_APP_ID.to_string(),
            app_name: APP_NAME.to_string(),
            bundle_identifier: "com.vaexil.vaexcore.pulse".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            pid: std::process::id(),
            started_at: started_at.clone(),
            updated_at: suite_timestamp(),
            api_url: Some(api_url.clone()),
            ws_url: None,
            health_url: Some(format!("{api_url}/health")),
            capabilities: vec![
                "pulse.api".to_string(),
                "highlight.review".to_string(),
                "studio.recording.intake".to_string(),
                "suite.commands".to_string(),
                "suite.launcher".to_string(),
                "suite.timeline".to_string(),
            ],
            launch_name: APP_NAME.to_string(),
            suite_session_id: session.as_ref().map(|session| session.session_id.clone()),
            activity: Some("review-workspace".to_string()),
            activity_detail: session
                .as_ref()
                .map(|session| format!("Reviewing within {}", session.title))
                .or_else(|| Some("Ready for Studio review handoffs".to_string())),
            local_runtime: Some(pulse_suite_local_runtime(app_data_dir.as_deref())),
        };

        if let Err(error) = write_suite_discovery_document(&document) {
            eprintln!("Unable to write vaexcore pulse suite discovery: {error}");
        }

        thread::sleep(SUITE_DISCOVERY_HEARTBEAT_INTERVAL);
    });
}

fn pulse_suite_local_runtime(app_data_dir: Option<&Path>) -> SuiteLocalRuntime {
    let api_ready = port_is_open(API_PORT);
    let analyzer_ready = port_is_open(ANALYZER_PORT);
    let ffmpeg_available = find_executable(
        "ffmpeg",
        &[
            "C:\\ffmpeg\\bin\\ffmpeg.exe",
            "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ],
    )
    .is_some();
    let app_storage_dir = app_data_dir
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| app_data_dir_for("vaexcore pulse").display().to_string());

    SuiteLocalRuntime {
        contract_version: SUITE_DISCOVERY_SCHEMA_VERSION,
        mode: "local-first".to_string(),
        state: if api_ready && analyzer_ready {
            "ready".to_string()
        } else if api_ready || analyzer_ready {
            "degraded".to_string()
        } else {
            "blocked".to_string()
        },
        app_storage_dir,
        suite_dir: suite_discovery_dir().display().to_string(),
        secure_storage: "none-required".to_string(),
        secret_storage_state: "not-applicable".to_string(),
        durable_storage: vec![
            "SQLite review and media library data".to_string(),
            "local analyzer/API service logs".to_string(),
            "Studio handoff manifests".to_string(),
        ],
        network_policy: "localhost-only".to_string(),
        dependencies: vec![
            SuiteLocalRuntimeDependency {
                name: "pulse-api".to_string(),
                kind: "local-http-service".to_string(),
                state: if api_ready { "reachable" } else { "missing" }.to_string(),
                detail: format!("Expected API bridge on 127.0.0.1:{API_PORT}."),
            },
            SuiteLocalRuntimeDependency {
                name: "pulse-analyzer".to_string(),
                kind: "local-http-service".to_string(),
                state: if analyzer_ready {
                    "reachable"
                } else {
                    "missing"
                }
                .to_string(),
                detail: format!("Expected analyzer on 127.0.0.1:{ANALYZER_PORT}."),
            },
            SuiteLocalRuntimeDependency {
                name: "ffmpeg".to_string(),
                kind: "local-binary".to_string(),
                state: if ffmpeg_available {
                    "available"
                } else {
                    "optional-missing"
                }
                .to_string(),
                detail: "Used for local probing, thumbnails, and future offline analysis paths."
                    .to_string(),
            },
            SuiteLocalRuntimeDependency {
                name: "packaged-service-bundle".to_string(),
                kind: "packaging".to_string(),
                state: helper_service_bundle_state().to_string(),
                detail: helper_service_bundle_detail(),
            },
        ],
    }
}

fn write_suite_discovery_document(document: &SuiteDiscoveryDocument) -> std::io::Result<()> {
    validate_suite_discovery_document(document).map_err(std::io::Error::other)?;
    let directory = suite_discovery_dir();
    fs::create_dir_all(&directory)?;
    let discovery_file = suite_app_definition_for(&document.app_id)
        .map(|definition| definition.discovery_file)
        .unwrap_or_else(|| document.app_id.as_str());
    let path = directory.join(discovery_file);
    let serialized = serde_json::to_vec_pretty(document)?;
    fs::write(path, serialized)
}

fn suite_app_definitions() -> &'static [SuiteAppDefinition] {
    SUITE_APP_DEFINITIONS
}

fn suite_app_definition_for(app_id: &str) -> Option<&'static SuiteAppDefinition> {
    suite_app_definitions()
        .iter()
        .find(|definition| definition.app_id == app_id)
}

fn validate_suite_discovery_document(document: &SuiteDiscoveryDocument) -> Result<(), String> {
    if document.schema_version != SUITE_DISCOVERY_SCHEMA_VERSION {
        return Err(format!(
            "expected schema version {}, got {}",
            SUITE_DISCOVERY_SCHEMA_VERSION, document.schema_version
        ));
    }
    let definition = suite_app_definition_for(&document.app_id)
        .ok_or_else(|| format!("unknown suite app {}", document.app_id))?;
    if document.app_name != definition.app_name {
        return Err(format!("unexpected appName {}", document.app_name));
    }
    if document.bundle_identifier != definition.bundle_identifier {
        return Err(format!(
            "unexpected bundleIdentifier {}",
            document.bundle_identifier
        ));
    }
    if document.launch_name != definition.launch_name {
        return Err(format!("unexpected launchName {}", document.launch_name));
    }
    if document.version.trim().is_empty() {
        return Err("version is required".to_string());
    }
    if document.pid == 0 {
        return Err("pid must be greater than 0".to_string());
    }
    if chrono::DateTime::parse_from_rfc3339(&document.started_at).is_err() {
        return Err("startedAt must be an RFC3339 timestamp".to_string());
    }
    if chrono::DateTime::parse_from_rfc3339(&document.updated_at).is_err() {
        return Err("updatedAt must be an RFC3339 timestamp".to_string());
    }
    if document.capabilities.is_empty() {
        return Err("capabilities must not be empty".to_string());
    }
    if let Some(api_url) = document.api_url.as_deref() {
        validate_local_url(api_url, "apiUrl")?;
    }
    if let Some(ws_url) = document.ws_url.as_deref() {
        validate_local_url(ws_url, "wsUrl")?;
    }
    if let Some(health_url) = document.health_url.as_deref() {
        validate_local_url(health_url, "healthUrl")?;
    }
    if let Some(runtime) = document.local_runtime.as_ref() {
        if runtime.contract_version != SUITE_DISCOVERY_SCHEMA_VERSION {
            return Err("localRuntime.contractVersion mismatch".to_string());
        }
        if runtime.dependencies.is_empty() {
            return Err("localRuntime.dependencies must not be empty".to_string());
        }
    }
    Ok(())
}

fn validate_local_url(value: &str, field: &str) -> Result<(), String> {
    if value.starts_with("http://127.0.0.1:")
        || value.starts_with("http://localhost:")
        || value.starts_with("ws://127.0.0.1:")
        || value.starts_with("ws://localhost:")
    {
        Ok(())
    } else {
        Err(format!("{field} must be a localhost URL"))
    }
}

fn suite_app_status(definition: &SuiteAppDefinition) -> SuiteAppStatus {
    let discovery_file = suite_discovery_dir().join(definition.discovery_file);
    let installed = desktop_app_is_installed(definition.launch_name);
    let discovery = read_suite_discovery_document(&discovery_file);
    let pid = discovery.as_ref().map(|document| document.pid);
    let running = pid.is_some_and(process_is_running);
    let stale = suite_discovery_is_stale(&discovery_file);
    let reachable = discovery
        .as_ref()
        .and_then(|document| document.health_url.as_deref())
        .is_some_and(health_url_is_reachable);
    let detail = suite_status_detail(installed, discovery.is_some(), running, stale, reachable);

    SuiteAppStatus {
        app_id: definition.app_id.to_string(),
        app_name: discovery
            .as_ref()
            .map(|document| document.app_name.clone())
            .unwrap_or_else(|| definition.app_name.to_string()),
        launch_name: definition.launch_name.to_string(),
        bundle_identifier: definition.bundle_identifier.to_string(),
        installed,
        running,
        reachable,
        stale,
        discovery_file: discovery_file.display().to_string(),
        pid,
        api_url: discovery
            .as_ref()
            .and_then(|document| document.api_url.clone()),
        health_url: discovery
            .as_ref()
            .and_then(|document| document.health_url.clone()),
        updated_at: discovery
            .as_ref()
            .map(|document| document.updated_at.clone()),
        capabilities: discovery
            .as_ref()
            .map(|document| document.capabilities.clone())
            .unwrap_or_default(),
        suite_session_id: discovery
            .as_ref()
            .and_then(|document| document.suite_session_id.clone()),
        activity: discovery
            .as_ref()
            .and_then(|document| document.activity.clone()),
        activity_detail: discovery
            .as_ref()
            .and_then(|document| document.activity_detail.clone()),
        local_runtime: discovery
            .as_ref()
            .and_then(|document| document.local_runtime.clone()),
        detail,
    }
}

fn read_suite_discovery_document(path: &Path) -> Option<SuiteDiscoveryDocument> {
    let contents = fs::read(path).ok()?;
    serde_json::from_slice(&contents).ok()
}

fn suite_status_detail(
    installed: bool,
    discovered: bool,
    running: bool,
    stale: bool,
    reachable: bool,
) -> String {
    if !installed {
        return platform_install_hint().to_string();
    }
    if !discovered {
        return "No suite heartbeat has been published yet.".to_string();
    }
    if !running {
        return "Heartbeat exists, but the app process is not running.".to_string();
    }
    if stale {
        return "The suite heartbeat is stale.".to_string();
    }
    if !reachable {
        return "The app is running, but its local health endpoint is not reachable.".to_string();
    }
    "Ready.".to_string()
}

fn suite_discovery_dir() -> PathBuf {
    vaexcore_shared_data_dir().join("suite")
}

fn desktop_app_is_installed(app_name: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        Path::new("/Applications")
            .join(format!("{app_name}.app"))
            .exists()
    }

    #[cfg(target_os = "windows")]
    {
        windows_app_executable_path(app_name).is_some()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app_name;
        false
    }
}

fn platform_install_hint() -> &'static str {
    if cfg!(target_os = "windows") {
        "Install this app with the Windows installer or place it under LocalAppData\\Programs."
    } else if cfg!(target_os = "macos") {
        "Install this app in /Applications."
    } else {
        "Install this app for the current desktop platform."
    }
}

#[cfg(target_os = "windows")]
fn windows_app_executable_path(app_name: &str) -> Option<PathBuf> {
    windows_app_executable_candidates(app_name)
        .into_iter()
        .find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn windows_app_executable_candidates(app_name: &str) -> Vec<PathBuf> {
    let executable_names = windows_app_executable_names(app_name);
    let mut candidates = Vec::new();
    for root in windows_local_app_data_roots() {
        for executable in &executable_names {
            candidates.push(root.join(app_name).join(executable));
            candidates.push(root.join("Programs").join(app_name).join(executable));
        }
    }
    for root in [
        env::var_os("ProgramFiles").map(PathBuf::from),
        env::var_os("ProgramFiles(x86)").map(PathBuf::from),
    ]
    .into_iter()
    .flatten()
    {
        for executable in &executable_names {
            candidates.push(root.join(app_name).join(executable));
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn windows_app_executable_names(app_name: &str) -> Vec<String> {
    match app_name {
        "vaexcore studio" => vec!["vaexcore-studio.exe".to_string()],
        "vaexcore pulse" => vec!["vaexcore-pulse.exe".to_string()],
        "vaexcore console" => vec!["vaexcore-console.exe".to_string()],
        _ => vec![format!("{app_name}.exe")],
    }
}

#[cfg(target_os = "windows")]
fn windows_local_app_data_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(root) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        roots.push(root);
    }
    if let Some(root) = env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|path| path.join("AppData").join("Local"))
    {
        roots.push(root);
    }
    roots
}

fn suite_handoff_dir() -> PathBuf {
    suite_discovery_dir().join("handoffs")
}

fn suite_session_file() -> PathBuf {
    suite_discovery_dir().join("session.json")
}

fn suite_command_dir() -> PathBuf {
    suite_discovery_dir().join("commands")
}

fn suite_timeline_file() -> PathBuf {
    suite_discovery_dir().join("timeline.jsonl")
}

fn append_suite_timeline_event(
    kind: &str,
    title: &str,
    detail: &str,
    metadata: serde_json::Value,
) -> std::io::Result<()> {
    fs::create_dir_all(suite_discovery_dir())?;
    let event = SuiteTimelineEvent {
        schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
        event_id: format!("pulse-{}-{}", suite_timestamp(), std::process::id()),
        source_app: PULSE_APP_ID.to_string(),
        source_app_name: APP_NAME.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
        detail: detail.to_string(),
        created_at: suite_timestamp(),
        metadata,
    };
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(suite_timeline_file())?;
    writeln!(file, "{}", serde_json::to_string(&event)?)?;
    Ok(())
}

fn read_suite_session_document() -> Option<SuiteSessionDocument> {
    let contents = fs::read(suite_session_file()).ok()?;
    serde_json::from_slice(&contents).ok()
}

fn read_suite_timeline_events(limit: usize) -> Vec<SuiteTimelineEvent> {
    let contents = match fs::read_to_string(suite_timeline_file()) {
        Ok(contents) => contents,
        Err(_) => return Vec::new(),
    };
    let mut events = contents
        .lines()
        .filter_map(|line| serde_json::from_str::<SuiteTimelineEvent>(line).ok())
        .collect::<Vec<_>>();
    events.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    events.truncate(limit);
    events
}

fn suite_discovery_is_stale(path: &Path) -> bool {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .map(|elapsed| elapsed > Duration::from_secs(45))
        .unwrap_or(true)
}

fn process_is_running(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        let pid_arg = pid.to_string();
        let filter = format!("PID eq {pid_arg}");
        let mut command = Command::new("tasklist");
        suppress_windows_console(&mut command);
        return command
            .args(["/FI", filter.as_str(), "/NH"])
            .output()
            .map(|output| {
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout)
                        .to_ascii_lowercase()
                        .contains(&pid_arg)
            })
            .unwrap_or(false);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let pid_arg = pid.to_string();
        Command::new("ps")
            .args(["-p", pid_arg.as_str()])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
}

fn health_url_is_reachable(url: &str) -> bool {
    let Some(address) = http_url_authority(url) else {
        return false;
    };
    let Ok(mut addresses) = address.to_socket_addrs() else {
        return false;
    };
    addresses
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(450)).is_ok())
}

fn http_url_authority(url: &str) -> Option<&str> {
    let rest = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))?;
    rest.split('/')
        .next()
        .filter(|authority| !authority.is_empty())
}

fn suite_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_services::{
        resolve_pulse_helper_paths_from_candidates, ApiBridgeLaunch, PulseHelperSource,
    };

    #[test]
    fn pulse_handoff_validation_rejects_wrong_schema_version() {
        let mut handoff = valid_handoff();
        handoff.schema_version = 2;

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("schema version"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_wrong_target_app() {
        let mut handoff = valid_handoff();
        handoff.target_app = "vaexcore-console".to_string();

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("target app"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_empty_recording_path() {
        let mut handoff = valid_handoff();
        handoff.recording.output_path = "  ".to_string();

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("outputPath"));
    }

    #[test]
    fn pulse_handoff_validation_rejects_stale_files() {
        let handoff = valid_handoff();

        assert!(validate_pulse_recording_handoff_document(
            &handoff,
            Some(PULSE_HANDOFF_STALE_AFTER + Duration::from_secs(1)),
        )
        .unwrap_err()
        .contains("stale"));
    }

    #[test]
    fn pulse_handoff_validation_accepts_output_ready_contract() {
        let mut handoff = valid_handoff();
        handoff.output_ready = Some(valid_output_ready());

        assert!(validate_pulse_recording_handoff_document(&handoff, None).is_ok());
    }

    #[test]
    fn pulse_handoff_validation_rejects_invalid_output_ready_contract() {
        let mut handoff = valid_handoff();
        let mut output_ready = valid_output_ready();
        output_ready.ready = true;
        output_ready.state = "blocked".to_string();
        handoff.output_ready = Some(output_ready);

        assert!(validate_pulse_recording_handoff_document(&handoff, None)
            .unwrap_err()
            .contains("outputReady.ready"));
    }

    #[test]
    fn suite_discovery_validation_rejects_epoch_timestamps() {
        let mut discovery = valid_discovery();
        discovery.started_at = "1778025273".to_string();

        assert!(validate_suite_discovery_document(&discovery)
            .unwrap_err()
            .contains("startedAt"));
    }

    #[test]
    fn suite_command_validation_rejects_non_object_payload() {
        let mut command = valid_suite_command();
        command.payload = serde_json::json!("bad-payload");

        assert!(validate_suite_command_document(&command, None)
            .unwrap_err()
            .contains("payload"));
    }

    #[test]
    fn suite_command_validation_rejects_wrong_target_app() {
        let mut command = valid_suite_command();
        command.target_app = "vaexcore-console".to_string();

        assert!(validate_suite_command_document(&command, None)
            .unwrap_err()
            .contains("target app"));
    }

    #[test]
    fn suite_command_validation_rejects_stale_files() {
        let command = valid_suite_command();

        assert!(validate_suite_command_document(
            &command,
            Some(SUITE_COMMAND_STALE_AFTER + Duration::from_secs(1)),
        )
        .unwrap_err()
        .contains("stale"));
    }

    #[test]
    fn suite_command_consume_removes_valid_and_invalid_schema_files() {
        let directory = temp_test_dir("suite-command-consume");
        let valid_path = directory.join("valid.json");
        let invalid_path = directory.join("invalid.json");
        fs::write(
            &valid_path,
            serde_json::to_vec_pretty(&valid_suite_command()).unwrap(),
        )
        .unwrap();
        let mut invalid = valid_suite_command();
        invalid.target_app = "vaexcore-console".to_string();
        fs::write(&invalid_path, serde_json::to_vec_pretty(&invalid).unwrap()).unwrap();

        let commands = consume_suite_commands_from_dir(&directory, false);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].command, "open-review");
        assert_eq!(commands[0].payload["recordingSessionId"], "rec_smoke");
        assert!(!valid_path.exists());
        assert!(!invalid_path.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn suite_command_consume_retains_malformed_json_files() {
        let directory = temp_test_dir("suite-command-malformed");
        let malformed_path = directory.join("malformed.json");
        fs::write(&malformed_path, "{bad json").unwrap();

        assert!(consume_suite_commands_from_dir(&directory, false).is_empty());
        assert!(malformed_path.exists());

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn handoff_consume_removes_valid_files() {
        let directory = temp_test_dir("handoff-valid");
        let path = directory.join(PULSE_RECORDING_INTAKE_FILE);
        fs::write(&path, serde_json::to_vec_pretty(&valid_handoff()).unwrap()).unwrap();

        let handoff = consume_pulse_recording_handoff_file(&path, false);

        let handoff = handoff.expect("handoff should be consumed");
        assert_eq!(handoff.recording.capture_mode.as_deref(), Some("display"));
        assert_eq!(
            handoff.recording.capture_detail.as_deref(),
            Some("Main Display recorded as a source-backed display.")
        );
        assert!(!path.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn handoff_consume_retains_malformed_json_files() {
        let directory = temp_test_dir("handoff-malformed");
        let path = directory.join(PULSE_RECORDING_INTAKE_FILE);
        fs::write(&path, "{bad json").unwrap();

        assert!(consume_pulse_recording_handoff_file(&path, false).is_none());
        assert!(path.exists());

        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn helper_resolution_prefers_packaged_resources_without_repo_fallback() {
        let manifest_dir = temp_test_dir("helper-manifest");
        let resources = temp_test_dir("helper-resources");
        create_packaged_helpers(&resources);

        let paths = resolve_pulse_helper_paths_from_candidates(
            None,
            Some(&resources),
            &manifest_dir,
            false,
        )
        .unwrap();

        assert_eq!(paths.source, PulseHelperSource::PackagedResources);
        assert!(paths.analyzer_source_dir.ends_with("pulse-analyzer/src"));
        match paths.api_launch {
            ApiBridgeLaunch::BundledScript { script } => {
                assert!(script.ends_with("pulse-api/server.mjs"));
            }
            ApiBridgeLaunch::TsxSource { .. } => panic!("expected bundled API script"),
        }

        let _ = fs::remove_dir_all(manifest_dir);
        let _ = fs::remove_dir_all(resources);
    }

    #[test]
    fn helper_resolution_rejects_packaged_mode_without_resources() {
        let manifest_dir = temp_test_dir("helper-missing-manifest");
        let resources = temp_test_dir("helper-missing-resources");

        let error = resolve_pulse_helper_paths_from_candidates(
            None,
            Some(&resources),
            &manifest_dir,
            false,
        )
        .unwrap_err();

        assert!(error.contains("packaged helper resources are missing"));
        let _ = fs::remove_dir_all(manifest_dir);
        let _ = fs::remove_dir_all(resources);
    }

    #[test]
    fn helper_resolution_allows_explicit_repo_override() {
        let repo = temp_test_dir("helper-repo");
        let manifest_dir = temp_test_dir("helper-manifest");
        create_repo_helpers(&repo);

        let paths =
            resolve_pulse_helper_paths_from_candidates(Some(&repo), None, &manifest_dir, false)
                .unwrap();

        assert_eq!(paths.source, PulseHelperSource::EnvRepo);
        match paths.api_launch {
            ApiBridgeLaunch::TsxSource { cli, script } => {
                assert!(cli.ends_with("node_modules/tsx/dist/cli.mjs"));
                assert!(script.ends_with("services/api/src/server.ts"));
            }
            ApiBridgeLaunch::BundledScript { .. } => panic!("expected repo API source"),
        }

        let _ = fs::remove_dir_all(repo);
        let _ = fs::remove_dir_all(manifest_dir);
    }

    fn valid_handoff() -> PulseRecordingHandoffDocument {
        PulseRecordingHandoffDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            request_id: "studio-recording-rec-smoke-1".to_string(),
            source_app: STUDIO_APP_ID.to_string(),
            source_app_name: "vaexcore studio".to_string(),
            target_app: PULSE_APP_ID.to_string(),
            requested_at: "2026-05-06T12:00:00Z".to_string(),
            recording: PulseRecordingHandoffRecording {
                session_id: "rec_smoke".to_string(),
                output_path: "/tmp/rec_smoke.mkv".to_string(),
                profile_id: Some("profile_1080p".to_string()),
                profile_name: Some("1080p".to_string()),
                capture_mode: Some("display".to_string()),
                capture_detail: Some(
                    "Main Display recorded as a source-backed display.".to_string(),
                ),
                stopped_at: "2026-05-06T12:05:00Z".to_string(),
            },
            output_ready: None,
        }
    }

    fn valid_output_ready() -> PulseRecordingHandoffOutputReady {
        PulseRecordingHandoffOutputReady {
            ready: true,
            state: "ready".to_string(),
            detail: "Scene output handoff is ready for Pulse intake.".to_string(),
            active_scene_id: Some("scene-main".to_string()),
            active_scene_name: Some("Main scene".to_string()),
            program_preview_frame_ready: Some(true),
            compositor_render_plan_ready: Some(true),
            output_preflight_ready: Some(true),
            media_pipeline_ready: Some(true),
            blockers: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn valid_suite_command() -> SuiteCommandDocument {
        SuiteCommandDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            command_id: "open-review-1".to_string(),
            source_app: STUDIO_APP_ID.to_string(),
            source_app_name: "vaexcore studio".to_string(),
            target_app: PULSE_APP_ID.to_string(),
            command: "open-review".to_string(),
            requested_at: "2026-05-06T12:00:00Z".to_string(),
            payload: serde_json::json!({ "recordingSessionId": "rec_smoke" }),
        }
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("vaexcore-pulse-{name}-{nanos}"));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn create_packaged_helpers(resources: &Path) {
        let analyzer_package = resources.join("pulse-analyzer/src/vaexcore_pulse_analyzer");
        fs::create_dir_all(&analyzer_package).unwrap();
        fs::write(analyzer_package.join("server.py"), "").unwrap();
        let api_dir = resources.join("pulse-api");
        fs::create_dir_all(&api_dir).unwrap();
        fs::write(api_dir.join("server.mjs"), "").unwrap();
    }

    fn create_repo_helpers(repo: &Path) {
        let analyzer_package = repo.join("services/analyzer/src/vaexcore_pulse_analyzer");
        fs::create_dir_all(&analyzer_package).unwrap();
        fs::write(analyzer_package.join("server.py"), "").unwrap();
        let api_dir = repo.join("services/api");
        fs::create_dir_all(api_dir.join("src")).unwrap();
        fs::write(api_dir.join("src/server.ts"), "").unwrap();
        let tsx_dir = api_dir.join("node_modules/tsx/dist");
        fs::create_dir_all(&tsx_dir).unwrap();
        fs::write(tsx_dir.join("cli.mjs"), "").unwrap();
    }

    fn valid_discovery() -> SuiteDiscoveryDocument {
        SuiteDiscoveryDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            app_id: PULSE_APP_ID.to_string(),
            app_name: APP_NAME.to_string(),
            bundle_identifier: "com.vaexil.vaexcore.pulse".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            pid: 1234,
            started_at: "2026-05-06T12:00:00Z".to_string(),
            updated_at: "2026-05-06T12:00:15Z".to_string(),
            api_url: Some("http://127.0.0.1:4010".to_string()),
            ws_url: None,
            health_url: Some("http://127.0.0.1:4010/health".to_string()),
            capabilities: vec!["pulse.api".to_string()],
            launch_name: APP_NAME.to_string(),
            suite_session_id: None,
            activity: Some("ready".to_string()),
            activity_detail: None,
            local_runtime: Some(SuiteLocalRuntime {
                contract_version: SUITE_DISCOVERY_SCHEMA_VERSION,
                mode: "local-first".to_string(),
                state: "ready".to_string(),
                app_storage_dir: "/tmp/pulse".to_string(),
                suite_dir: "/tmp/vaexcore/suite".to_string(),
                secure_storage: "none-required".to_string(),
                secret_storage_state: "not-applicable".to_string(),
                durable_storage: vec!["sqlite".to_string()],
                network_policy: "localhost-only".to_string(),
                dependencies: vec![SuiteLocalRuntimeDependency {
                    name: "pulse-api".to_string(),
                    kind: "local-http-service".to_string(),
                    state: "reachable".to_string(),
                    detail: "http://127.0.0.1:4010".to_string(),
                }],
            }),
        }
    }
}
