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
