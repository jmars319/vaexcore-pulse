use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::env;
use std::fs::{self, File, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

mod suite_protocol;
use suite_protocol::{
    SuiteAppDefinition, PULSE_APP_ID, PULSE_RECORDING_INTAKE_FILE, STUDIO_APP_ID,
    SUITE_APP_DEFINITIONS, SUITE_DISCOVERY_SCHEMA_VERSION, VAEXCORE_SUITE_APPS,
};

const APP_NAME: &str = "vaexcore pulse";
const MAIN_WINDOW_LABEL: &str = "main";
const SETTINGS_WINDOW_LABEL: &str = "settings";
const MENU_OPEN_SETTINGS: &str = "open-settings";
const MENU_OPEN_PROFILE_SETUP: &str = "open-profile-setup";
const MENU_SHOW_MAIN: &str = "show-main-window";
const MENU_CLOSE_MAIN: &str = "close-main-window";
const MENU_CLOSE_MAIN_FILE: &str = "close-main-window-file";
const MENU_QUIT_APP: &str = "quit-app";
const MENU_LAUNCH_SUITE: &str = "launch-suite";
const ANALYZER_PORT: u16 = 9010;
const API_PORT: u16 = 4010;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const DETACHED_PROCESS: u32 = 0x00000008;
const SUITE_DISCOVERY_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const PULSE_HANDOFF_STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);
const SUITE_COMMAND_STALE_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Default)]
struct ManagedLocalServices {
    analyzer: Option<Child>,
    api: Option<Child>,
}

struct SpawnedLocalService {
    child: Child,
    log_path: PathBuf,
}

fn suppress_windows_console(_command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        _command.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
}

#[derive(Debug)]
struct PulseHelperPaths {
    analyzer_source_dir: PathBuf,
    api_working_dir: PathBuf,
    api_launch: ApiBridgeLaunch,
    source: PulseHelperSource,
}

#[derive(Debug)]
enum ApiBridgeLaunch {
    BundledScript { script: PathBuf },
    TsxSource { cli: PathBuf, script: PathBuf },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PulseHelperSource {
    EnvRepo,
    PackagedResources,
    DevRepo,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SuiteLaunchResult {
    app_name: String,
    ok: bool,
    detail: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteDiscoveryDocument {
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
struct SuiteLocalRuntime {
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
struct SuiteLocalRuntimeDependency {
    name: String,
    kind: String,
    state: String,
    detail: String,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteSessionDocument {
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
struct SuiteCommandDocument {
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
struct SuiteTimelineEvent {
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
struct SuiteAppStatus {
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
struct SuiteTimelineInput {
    kind: String,
    title: String,
    detail: String,
    metadata: serde_json::Value,
}

#[derive(Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PulseRecordingHandoffDocument {
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
struct PulseRecordingHandoffRecording {
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
struct PulseRecordingHandoffOutputReady {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(ManagedLocalServices::default()))
        .setup(|app| {
            let app_handle = app.handle().clone();
            thread::spawn(move || match ensure_local_services(&app_handle) {
                Ok(()) => {
                    let app_data_dir = app_handle.path().app_data_dir().ok();
                    start_suite_discovery_heartbeat(app_data_dir);
                }
                Err(error) => {
                    eprintln!("Unable to start vaexcore pulse local services: {error}");
                }
            });
            Ok(())
        })
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            if event.id() == MENU_OPEN_SETTINGS {
                let _ = open_settings_window_for(app, None);
            } else if event.id() == MENU_OPEN_PROFILE_SETUP {
                let _ = open_settings_window_for(app, Some("profile-setup"));
            } else if event.id() == MENU_SHOW_MAIN {
                let _ = show_main_window(app);
            } else if event.id() == MENU_CLOSE_MAIN || event.id() == MENU_CLOSE_MAIN_FILE {
                let _ = close_main_window(app);
            } else if event.id() == MENU_QUIT_APP {
                stop_local_services(app);
                app.exit(0);
            } else if event.id() == MENU_LAUNCH_SUITE {
                thread::spawn(|| {
                    for result in launch_vaexcore_suite() {
                        if !result.ok {
                            eprintln!(
                                "Unable to launch {} from vaexcore suite: {}",
                                result.app_name, result.detail
                            );
                        }
                    }
                });
            }
        })
        .on_window_event(|window, event| {
            if window.label() == MAIN_WINDOW_LABEL {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            analyzer_health,
            studio_api_discovery,
            inspect_media_playback,
            prepare_media_preview_clip,
            open_media_in_quicktime,
            open_settings_window,
            launch_vaexcore_suite,
            suite_status,
            suite_session,
            suite_timeline,
            append_suite_timeline,
            consume_pulse_recording_handoff,
            consume_suite_commands
        ])
        .build(tauri::generate_context!())
        .expect("failed to build vaexcore pulse desktop shell");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            stop_local_services(app_handle);
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => {
            let _ = show_main_window(app_handle);
        }
        _ => {}
    });
}

fn build_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let package_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(APP_NAME.to_string()),
        version: Some(package_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &MenuItem::with_id(app, MENU_SHOW_MAIN, "Show Main Window", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::show_all(app, None)?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                APP_NAME,
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_OPEN_SETTINGS,
                        "Settings...",
                        true,
                        Some("CmdOrCtrl+Comma"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        MENU_OPEN_PROFILE_SETUP,
                        "Profile Setup...",
                        true,
                        None::<&str>,
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_LAUNCH_SUITE,
                        "Launch vaexcore Suite",
                        true,
                        None::<&str>,
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_SHOW_MAIN,
                        "Show Main Window",
                        true,
                        None::<&str>,
                    )?,
                    &MenuItem::with_id(
                        app,
                        MENU_CLOSE_MAIN,
                        "Close Main Window (Pulse Keeps Running)",
                        true,
                        Some("CmdOrCtrl+W"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        MENU_QUIT_APP,
                        "Quit vaexcore pulse (Stops Background Work)",
                        true,
                        Some("CmdOrCtrl+Q"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                ],
            )?,
            #[cfg(not(any(
                target_os = "macos",
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            )))]
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, MENU_OPEN_SETTINGS, "Settings...", true, None::<&str>)?,
                    &MenuItem::with_id(
                        app,
                        MENU_OPEN_PROFILE_SETUP,
                        "Profile Setup...",
                        true,
                        None::<&str>,
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_LAUNCH_SUITE,
                        "Launch vaexcore Suite",
                        true,
                        None::<&str>,
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        MENU_CLOSE_MAIN_FILE,
                        "Close Main Window (Pulse Keeps Running)",
                        true,
                        None::<&str>,
                    )?,
                    #[cfg(not(target_os = "macos"))]
                    &MenuItem::with_id(
                        app,
                        MENU_QUIT_APP,
                        "Quit vaexcore pulse (Stops Background Work)",
                        true,
                        Some("CmdOrCtrl+Q"),
                    )?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &window_menu,
        ],
    )
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle, section: Option<String>) -> Result<(), String> {
    open_settings_window_for(&app, section.as_deref())
}

#[tauri::command]
fn launch_vaexcore_suite() -> Vec<SuiteLaunchResult> {
    VAEXCORE_SUITE_APPS
        .iter()
        .map(|app_name| launch_desktop_app(app_name))
        .collect()
}

#[tauri::command]
fn suite_status() -> Vec<SuiteAppStatus> {
    suite_app_definitions()
        .iter()
        .map(suite_app_status)
        .collect()
}

#[tauri::command]
fn suite_session() -> Option<SuiteSessionDocument> {
    read_suite_session_document()
}

#[tauri::command]
fn suite_timeline(limit: Option<usize>) -> Vec<SuiteTimelineEvent> {
    read_suite_timeline_events(limit.unwrap_or(50))
}

#[tauri::command]
fn append_suite_timeline(input: SuiteTimelineInput) -> Result<(), String> {
    append_suite_timeline_event(&input.kind, &input.title, &input.detail, input.metadata)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn consume_pulse_recording_handoff() -> Option<PulseRecordingHandoffDocument> {
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
fn consume_suite_commands() -> Vec<SuiteCommandDocument> {
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

fn start_suite_discovery_heartbeat(app_data_dir: Option<PathBuf>) {
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

fn vaexcore_shared_data_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        return env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("AppData")
                    .join("Roaming")
            })
            .join("vaexcore");
    }

    if cfg!(target_os = "macos") {
        return env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("Library")
            .join("Application Support")
            .join("vaexcore");
    }

    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".local")
                .join("share")
        })
        .join("vaexcore")
}

fn app_data_dir_for(app_dir_name: &str) -> PathBuf {
    if cfg!(target_os = "windows") {
        return env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("AppData")
                    .join("Roaming")
            })
            .join(app_dir_name);
    }

    if cfg!(target_os = "macos") {
        return env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("Library")
            .join("Application Support")
            .join(app_dir_name);
    }

    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".local")
                .join("share")
        })
        .join(app_dir_name)
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

fn open_settings_window_for<R: Runtime>(
    app: &tauri::AppHandle<R>,
    section: Option<&str>,
) -> Result<(), String> {
    let section = normalize_settings_section(section);

    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        if let Some(section) = section {
            window
                .emit("settings-section-selected", section)
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    let settings_url = match section {
        Some(section) => format!("index.html?window=settings&section={section}"),
        None => "index.html?window=settings".to_string(),
    };

    WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App(settings_url.into()),
    )
    .title("vaexcore pulse Settings")
    .inner_size(760.0, 660.0)
    .min_inner_size(560.0, 500.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

fn normalize_settings_section(section: Option<&str>) -> Option<&'static str> {
    match section {
        Some("profile-setup") => Some("profile-setup"),
        Some("appearance") => Some("appearance"),
        Some("window-behavior") => Some("window-behavior"),
        _ => None,
    }
}

fn ensure_local_services<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let helper_paths = resolve_pulse_helper_paths(app)?;

    if !port_is_open(ANALYZER_PORT) {
        let mut analyzer = spawn_analyzer(&helper_paths)?;
        wait_for_port_or_child_exit(
            "Analyzer",
            ANALYZER_PORT,
            &mut analyzer.child,
            &analyzer.log_path,
            Duration::from_secs(30),
        )?;
        app.state::<Mutex<ManagedLocalServices>>()
            .lock()
            .map_err(|_| "Unable to track analyzer process.".to_string())?
            .analyzer = Some(analyzer.child);
    }

    if !port_is_open(API_PORT) {
        let mut api = spawn_api_bridge(&helper_paths)?;
        wait_for_port_or_child_exit(
            "API bridge",
            API_PORT,
            &mut api.child,
            &api.log_path,
            Duration::from_secs(30),
        )?;
        app.state::<Mutex<ManagedLocalServices>>()
            .lock()
            .map_err(|_| "Unable to track API bridge process.".to_string())?
            .api = Some(api.child);
    }

    Ok(())
}

fn stop_local_services<R: Runtime>(app: &tauri::AppHandle<R>) {
    let service_state = app.state::<Mutex<ManagedLocalServices>>();
    let Ok(mut services) = service_state.lock() else {
        return;
    };

    let mut spawned_api = false;
    if let Some(mut api) = services.api.take() {
        spawned_api = true;
        let _ = api.kill();
        let _ = api.wait();
    }

    if spawned_api {
        stop_port_listener(API_PORT);
    }

    let mut spawned_analyzer = false;
    if let Some(mut analyzer) = services.analyzer.take() {
        spawned_analyzer = true;
        let _ = analyzer.kill();
        let _ = analyzer.wait();
    }

    if spawned_analyzer {
        stop_port_listener(ANALYZER_PORT);
    }
}

fn spawn_analyzer(helper_paths: &PulseHelperPaths) -> Result<SpawnedLocalService, String> {
    let python = if cfg!(target_os = "windows") {
        find_executable("python", &[])
            .or_else(|| find_executable("python3", &[]))
            .or_else(|| find_executable("py", &[]))
    } else {
        find_executable(
            "python3",
            &[
                "/opt/homebrew/bin/python3",
                "/usr/local/bin/python3",
                "/usr/bin/python3",
            ],
        )
    }
    .ok_or_else(|| "python3 is required to start the local analyzer.".to_string())?;
    let analyzer_source_dir = &helper_paths.analyzer_source_dir;
    let analyzer_working_dir = analyzer_source_dir
        .parent()
        .unwrap_or(analyzer_source_dir.as_path());
    let (log_path, stdout, stderr) = service_stdio("analyzer")?;

    let mut command = Command::new(&python);
    command
        .current_dir(analyzer_working_dir)
        .env("PYTHONPATH", analyzer_source_dir)
        .env("PATH", command_path())
        .env("VAEXCORE_PULSE_HELPER_SOURCE", helper_paths.source.label());
    if cfg!(target_os = "windows")
        && python
            .file_stem()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("py"))
    {
        command.arg("-3");
    }
    suppress_windows_console(&mut command);
    let child = command
        .arg("-m")
        .arg("vaexcore_pulse_analyzer.server")
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr)
        .spawn()
        .map_err(|error| format!("Failed to start the local analyzer: {error}"))?;

    Ok(SpawnedLocalService { child, log_path })
}

fn spawn_api_bridge(helper_paths: &PulseHelperPaths) -> Result<SpawnedLocalService, String> {
    let node = normalize_node_executable(
        find_executable(
            "node",
            &[
                "C:\\Program Files\\nodejs\\node.exe",
                "/opt/homebrew/opt/node@22/bin/node",
                "/opt/homebrew/opt/node/bin/node",
                "/opt/homebrew/bin/node",
                "/usr/local/bin/node",
                "/usr/bin/node",
            ],
        )
        .ok_or_else(|| "node is required to start the local API bridge.".to_string())?,
    );
    let (log_path, stdout, stderr) = service_stdio("api-bridge")?;

    let mut command = Command::new(node);
    command
        .current_dir(&helper_paths.api_working_dir)
        .env("PATH", command_path())
        .env("VAEXCORE_PULSE_HELPER_SOURCE", helper_paths.source.label())
        .env(
            "VAEXCORE_PULSE_ANALYZER_URL",
            format!("http://127.0.0.1:{ANALYZER_PORT}"),
        );
    match &helper_paths.api_launch {
        ApiBridgeLaunch::BundledScript { script } => {
            command.arg(command_arg_relative_to(
                script,
                &helper_paths.api_working_dir,
            ));
        }
        ApiBridgeLaunch::TsxSource { cli, script } => {
            command
                .arg(command_arg_relative_to(cli, &helper_paths.api_working_dir))
                .arg(command_arg_relative_to(
                    script,
                    &helper_paths.api_working_dir,
                ));
        }
    }

    suppress_windows_console(&mut command);
    let child = command
        .stdin(Stdio::null())
        .stdout(stdout)
        .stderr(stderr)
        .spawn()
        .map_err(|error| format!("Failed to start the local API bridge: {error}"))?;

    Ok(SpawnedLocalService { child, log_path })
}

fn command_arg_relative_to(path: &Path, working_dir: &Path) -> PathBuf {
    path.strip_prefix(working_dir)
        .map(Path::to_path_buf)
        .unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(target_os = "windows")]
fn normalize_node_executable(node: PathBuf) -> PathBuf {
    if !node.to_string_lossy().contains(' ') {
        return node;
    }

    for candidate in [
        "C:\\Progra~1\\nodejs\\node.exe",
        "C:\\Progra~2\\nodejs\\node.exe",
    ] {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return path;
        }
    }

    node
}

#[cfg(not(target_os = "windows"))]
fn normalize_node_executable(node: PathBuf) -> PathBuf {
    node
}

fn resolve_pulse_helper_paths<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PulseHelperPaths, String> {
    let configured_repo = env::var("VAEXCORE_PULSE_REPO_ROOT").ok().map(PathBuf::from);
    let resource_dir = app.path().resource_dir().ok();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    resolve_pulse_helper_paths_from_candidates(
        configured_repo.as_deref(),
        resource_dir.as_deref(),
        &manifest_dir,
        repo_helper_fallback_allowed(),
    )
}

fn resolve_pulse_helper_paths_from_candidates(
    configured_repo: Option<&Path>,
    resource_dir: Option<&Path>,
    manifest_dir: &Path,
    allow_repo_fallback: bool,
) -> Result<PulseHelperPaths, String> {
    if let Some(configured_repo) = configured_repo {
        return repo_helper_paths(configured_repo, PulseHelperSource::EnvRepo);
    }

    if let Some(resource_dir) = resource_dir {
        if let Some(paths) = packaged_helper_paths(resource_dir) {
            return Ok(paths);
        }
    }

    if allow_repo_fallback {
        let repo_root = repo_root_from_manifest_dir(manifest_dir)?;
        return repo_helper_paths(&repo_root, PulseHelperSource::DevRepo);
    }

    Err("Pulse packaged helper resources are missing; rebuild the app so pulse-api and pulse-analyzer are bundled.".to_string())
}

fn packaged_helper_paths(resource_dir: &Path) -> Option<PulseHelperPaths> {
    let analyzer_source_dir = resource_dir.join("pulse-analyzer/src");
    let api_script = resource_dir.join("pulse-api/server.mjs");
    if analyzer_source_dir
        .join("vaexcore_pulse_analyzer/server.py")
        .exists()
        && api_script.exists()
    {
        return Some(PulseHelperPaths {
            analyzer_source_dir,
            api_working_dir: api_script.parent().unwrap_or(resource_dir).to_path_buf(),
            api_launch: ApiBridgeLaunch::BundledScript { script: api_script },
            source: PulseHelperSource::PackagedResources,
        });
    }

    None
}

fn repo_helper_paths(
    repo_root: &Path,
    source: PulseHelperSource,
) -> Result<PulseHelperPaths, String> {
    let api_dir = repo_root.join("services/api");
    let api_script = api_dir.join("src/server.ts");
    let tsx_cli = api_dir.join("node_modules/tsx/dist/cli.mjs");
    let analyzer_source_dir = repo_root.join("services/analyzer/src");

    if !api_script.exists() {
        return Err(format!(
            "Pulse API bridge source is missing at {}.",
            api_script.display()
        ));
    }
    if !tsx_cli.exists() {
        return Err(format!(
            "Pulse API bridge dependencies are missing at {}. Run pnpm install in the Pulse repo.",
            tsx_cli.display()
        ));
    }
    if !analyzer_source_dir
        .join("vaexcore_pulse_analyzer/server.py")
        .exists()
    {
        return Err(format!(
            "Pulse analyzer source is missing at {}.",
            analyzer_source_dir.display()
        ));
    }

    Ok(PulseHelperPaths {
        analyzer_source_dir,
        api_working_dir: api_dir,
        api_launch: ApiBridgeLaunch::TsxSource {
            cli: tsx_cli,
            script: api_script,
        },
        source,
    })
}

fn repo_root_from_manifest_dir(manifest_dir: &Path) -> Result<PathBuf, String> {
    manifest_dir
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to locate the vaexcore pulse repository.".to_string())
}

fn repo_helper_fallback_allowed() -> bool {
    cfg!(debug_assertions) || env_flag("VAEXCORE_PULSE_ALLOW_REPO_HELPERS")
}

fn env_flag(name: &str) -> bool {
    env::var(name)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

fn helper_service_bundle_state() -> &'static str {
    match helper_service_source_for_status() {
        Some(PulseHelperSource::PackagedResources) => "available",
        Some(PulseHelperSource::EnvRepo) => "repo-override",
        Some(PulseHelperSource::DevRepo) => "dev-fallback",
        None => "missing",
    }
}

fn helper_service_bundle_detail() -> String {
    match helper_service_source_for_status() {
        Some(PulseHelperSource::PackagedResources) => {
            "Pulse will start analyzer/API helpers from bundled app resources.".to_string()
        }
        Some(PulseHelperSource::EnvRepo) => {
            "Pulse will start analyzer/API helpers from VAEXCORE_PULSE_REPO_ROOT.".to_string()
        }
        Some(PulseHelperSource::DevRepo) => {
            "Pulse will start analyzer/API helpers from the local repo only in development fallback mode.".to_string()
        }
        None => "Pulse could not find bundled helper resources or an allowed development helper fallback.".to_string(),
    }
}

fn helper_service_source_for_status() -> Option<PulseHelperSource> {
    if let Ok(configured_repo) = env::var("VAEXCORE_PULSE_REPO_ROOT") {
        return repo_helper_paths(Path::new(&configured_repo), PulseHelperSource::EnvRepo)
            .ok()
            .map(|paths| paths.source);
    }

    for resource_dir in candidate_resource_dirs_from_current_exe() {
        if let Some(paths) = packaged_helper_paths(&resource_dir) {
            return Some(paths.source);
        }
    }

    if repo_helper_fallback_allowed() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Ok(repo_root) = repo_root_from_manifest_dir(&manifest_dir) {
            return repo_helper_paths(&repo_root, PulseHelperSource::DevRepo)
                .ok()
                .map(|paths| paths.source);
        }
    }

    None
}

fn candidate_resource_dirs_from_current_exe() -> Vec<PathBuf> {
    let Ok(executable) = env::current_exe() else {
        return Vec::new();
    };
    let Some(executable_dir) = executable.parent() else {
        return Vec::new();
    };

    let mut candidates = vec![executable_dir.to_path_buf()];
    if let Some(contents_dir) = executable_dir.parent() {
        candidates.push(contents_dir.join("Resources"));
    }
    candidates
}

impl PulseHelperSource {
    fn label(self) -> &'static str {
        match self {
            PulseHelperSource::EnvRepo => "env-repo",
            PulseHelperSource::PackagedResources => "packaged-resources",
            PulseHelperSource::DevRepo => "dev-repo",
        }
    }
}

fn find_executable(name: &str, fallback_paths: &[&str]) -> Option<PathBuf> {
    let names = executable_names(name);
    if let Some(paths) = env::var_os("PATH") {
        for directory in env::split_paths(&paths) {
            for executable_name in &names {
                let candidate = directory.join(executable_name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    let mut fallback_candidates = fallback_paths.iter().map(PathBuf::from).collect::<Vec<_>>();
    if cfg!(target_os = "windows") && is_ffmpeg_tool(name) {
        fallback_candidates.extend(windows_ffmpeg_tool_candidates(name));
    }

    fallback_candidates
        .into_iter()
        .find(|candidate| candidate.exists())
}

fn executable_names(name: &str) -> Vec<String> {
    if cfg!(target_os = "windows") && !name.to_ascii_lowercase().ends_with(".exe") {
        vec![format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    }
}

fn is_ffmpeg_tool(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().trim_end_matches(".exe"),
        "ffmpeg" | "ffprobe"
    )
}

fn windows_ffmpeg_tool_candidates(name: &str) -> Vec<PathBuf> {
    let names = executable_names(name);
    let mut candidates = Vec::new();
    for directory in windows_ffmpeg_tool_directories() {
        for executable_name in &names {
            candidates.push(directory.join(executable_name));
        }
    }
    candidates
}

fn windows_ffmpeg_tool_directories() -> Vec<PathBuf> {
    let mut directories = vec![
        PathBuf::from("C:\\ffmpeg\\bin"),
        PathBuf::from("C:\\Program Files\\ffmpeg\\bin"),
        PathBuf::from("C:\\ProgramData\\chocolatey\\bin"),
    ];

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        directories.push(PathBuf::from(user_profile).join("scoop\\shims"));
    }

    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let winget_root = PathBuf::from(local_app_data).join("Microsoft\\WinGet");
        directories.push(winget_root.join("Links"));
        let packages_root = winget_root.join("Packages");
        let Ok(packages) = fs::read_dir(packages_root) else {
            return directories;
        };

        for package in packages.flatten() {
            let package_name = package.file_name().to_string_lossy().to_string();
            if !package_name.starts_with("Gyan.FFmpeg_") {
                continue;
            }

            let Ok(package_children) = fs::read_dir(package.path()) else {
                continue;
            };
            for package_child in package_children.flatten() {
                directories.push(package_child.path().join("bin"));
            }
        }
    }

    directories
}

fn command_path() -> String {
    let current_path = env::var("PATH").unwrap_or_default();
    if cfg!(target_os = "windows") {
        let mut entries = vec![
            "C:\\Program Files\\nodejs".to_string(),
            "C:\\Python312".to_string(),
            "C:\\Python311".to_string(),
        ];
        entries.extend(
            windows_ffmpeg_tool_directories()
                .into_iter()
                .map(|path| path.to_string_lossy().to_string()),
        );
        entries.push(current_path);
        entries.join(";")
    } else {
        format!(
            "/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:{current_path}"
        )
    }
}

fn port_is_open(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok()
}

fn stop_port_listener(port: u16) {
    #[cfg(target_os = "windows")]
    {
        let mut netstat = Command::new("netstat");
        suppress_windows_console(&mut netstat);
        let Ok(output) = netstat.args(["-ano", "-p", "tcp"]).output() else {
            return;
        };
        if !output.status.success() {
            return;
        }
        let needle = format!(":{port}");
        let pids = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter(|line| line.contains(&needle) && line.contains("LISTENING"))
            .filter_map(|line| line.split_whitespace().last())
            .filter(|pid| pid.chars().all(|character| character.is_ascii_digit()))
            .map(str::to_string)
            .collect::<Vec<_>>();

        for pid in pids {
            let mut taskkill = Command::new("taskkill");
            suppress_windows_console(&mut taskkill);
            let _ = taskkill.args(["/PID", &pid, "/T", "/F"]).output();
        }
        return;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let lsof = find_executable("lsof", &["/usr/sbin/lsof", "/usr/bin/lsof"])
            .unwrap_or_else(|| PathBuf::from("/usr/sbin/lsof"));
        let Ok(output) = Command::new(lsof)
            .args(["-nP", &format!("-tiTCP:{port}"), "-sTCP:LISTEN"])
            .output()
        else {
            return;
        };

        if !output.status.success() {
            return;
        }

        let pids = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|pid| {
                !pid.is_empty() && pid.chars().all(|character| character.is_ascii_digit())
            })
            .map(str::to_string)
            .collect::<Vec<_>>();

        for pid in pids {
            let _ = Command::new("/bin/kill").args(["-TERM", &pid]).output();
        }

        let started_at = SystemTime::now();
        while port_is_open(port)
            && started_at
                .elapsed()
                .unwrap_or_else(|_| Duration::from_secs(0))
                < Duration::from_secs(2)
        {
            thread::sleep(Duration::from_millis(100));
        }
    }
}

fn wait_for_port_or_child_exit(
    service_name: &str,
    port: u16,
    child: &mut Child,
    log_path: &Path,
    timeout: Duration,
) -> Result<(), String> {
    let started_at = SystemTime::now();

    loop {
        if port_is_open(port) {
            return Ok(());
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not check {service_name}: {error}"))?
        {
            return Err(format!(
                "{service_name} exited before opening port {port} ({status}). See {}.",
                log_path.display()
            ));
        }

        if started_at
            .elapsed()
            .unwrap_or_else(|_| Duration::from_secs(0))
            >= timeout
        {
            return Err(format!(
                "{service_name} did not finish starting on port {port}. See {}.",
                log_path.display()
            ));
        }

        thread::sleep(Duration::from_millis(300));
    }
}

fn service_stdio(service_name: &str) -> Result<(PathBuf, Stdio, Stdio), String> {
    let log_directory = pulse_log_dir();
    fs::create_dir_all(&log_directory).map_err(|error| {
        format!(
            "Could not create Pulse service log directory {}: {error}",
            log_directory.display()
        )
    })?;
    let log_path = log_directory.join(format!("{service_name}.log"));
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| {
            format!(
                "Could not open Pulse service log file {}: {error}",
                log_path.display()
            )
        })?;
    let stderr = log_file.try_clone().map_err(|error| {
        format!(
            "Could not prepare Pulse service log file {}: {error}",
            log_path.display()
        )
    })?;

    Ok((log_path, Stdio::from(log_file), Stdio::from(stderr)))
}

fn pulse_log_dir() -> PathBuf {
    vaexcore_shared_data_dir().join("pulse").join("logs")
}

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("The main vaexcore pulse window is not available.".to_string());
    };

    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn close_main_window<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("The main vaexcore pulse window is not available.".to_string());
    };

    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn analyzer_health() -> &'static str {
    "analyzer bridge pending"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StudioApiDiscovery {
    api_url: String,
    ws_url: String,
    token: Option<String>,
    discovered: bool,
    source: String,
    detail: String,
}

#[tauri::command]
fn studio_api_discovery() -> StudioApiDiscovery {
    let configured_api_url = env::var("VAEXCORE_STUDIO_API_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let configured_ws_url = env::var("VAEXCORE_STUDIO_WS_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let token = env::var("VAEXCORE_STUDIO_API_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(api_url) = configured_api_url {
        let ws_url = configured_ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url));
        return StudioApiDiscovery {
            api_url,
            ws_url,
            token,
            discovered: true,
            source: "env".to_string(),
            detail: "Using VAEXCORE_STUDIO_API_URL.".to_string(),
        };
    }

    for discovery_path in studio_discovery_file_paths() {
        if let Ok(raw) = fs::read_to_string(&discovery_path) {
            if let Ok(document) = serde_json::from_str::<serde_json::Value>(&raw) {
                let api_url = document
                    .get("apiUrl")
                    .or_else(|| document.get("api_url"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);
                let ws_url = document
                    .get("wsUrl")
                    .or_else(|| document.get("ws_url"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);

                if let Some(api_url) = api_url {
                    return StudioApiDiscovery {
                        ws_url: configured_ws_url.unwrap_or_else(|| {
                            ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url))
                        }),
                        api_url,
                        token,
                        discovered: true,
                        source: "discovery_file".to_string(),
                        detail: format!("Loaded {}.", discovery_path.display()),
                    };
                }
            }
        }
    }

    let api_url = "http://127.0.0.1:51287".to_string();
    StudioApiDiscovery {
        ws_url: configured_ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url)),
        api_url,
        token,
        discovered: false,
        source: "default".to_string(),
        detail: "Studio discovery file was not found; using the default localhost URL.".to_string(),
    }
}

fn studio_discovery_file_paths() -> Vec<PathBuf> {
    vec![
        app_data_dir_for("com.vaexcore.studio").join("api-discovery.json"),
        app_data_dir_for("vaexcore studio").join("api-discovery.json"),
    ]
}

fn ws_url_from_api_url(api_url: &str) -> String {
    let base = api_url.trim_end_matches('/');
    let ws_base = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        base.to_string()
    };
    format!("{}/events", ws_base.trim_end_matches('/'))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaPlaybackInspection {
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
struct PreparedMediaPreview {
    preview_path: String,
    reused_existing: bool,
    file_size_bytes: Option<u64>,
    duration_seconds: f64,
    detail: String,
}

#[tauri::command]
fn inspect_media_playback(media_path: String) -> Result<MediaPlaybackInspection, String> {
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

#[tauri::command]
fn prepare_media_preview_clip(
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

#[tauri::command]
fn open_media_in_quicktime(
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

fn cleanup_old_preview_clips(cache_dir: &Path) {
    let expire_before = SystemTime::now()
        .checked_sub(Duration::from_secs(60 * 60 * 24 * 3))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let max_cache_bytes: u64 = 512 * 1024 * 1024;
    let max_cache_files: usize = 24;

    let entries = match fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut retained_entries = Vec::new();
    for entry in entries.flatten() {
        let preview_path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let modified_time = match metadata.modified() {
            Ok(modified_time) => modified_time,
            Err(_) => continue,
        };

        if modified_time < expire_before {
            let _ = fs::remove_file(preview_path);
            continue;
        }

        retained_entries.push((preview_path, metadata.len(), modified_time));
    }

    retained_entries.sort_by_key(|(_, _, modified_time)| *modified_time);

    let mut total_bytes = retained_entries
        .iter()
        .fold(0_u64, |sum, (_, size_bytes, _)| {
            sum.saturating_add(*size_bytes)
        });
    let mut total_files = retained_entries.len();

    for (preview_path, size_bytes, _) in retained_entries {
        if total_bytes <= max_cache_bytes && total_files <= max_cache_files {
            break;
        }

        if fs::remove_file(&preview_path).is_ok() {
            total_bytes = total_bytes.saturating_sub(size_bytes);
            total_files = total_files.saturating_sub(1);
        }
    }
}

fn preview_cache_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("vaexcore-pulse-preview-clips")
}

fn sanitize_file_stem(file_stem: &str) -> String {
    let sanitized = file_stem
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "moment-preview".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
