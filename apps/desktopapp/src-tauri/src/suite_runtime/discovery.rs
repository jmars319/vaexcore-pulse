pub(crate) fn start_suite_discovery_heartbeat(app_data_dir: Option<PathBuf>) {
    let started_at = suite_timestamp();

    thread::spawn(move || loop {
        let definition = suite_app_definition_for(PULSE_APP_ID)
            .expect("vaexcore pulse must be present in suite protocol definitions");
        let api_url = format!("http://127.0.0.1:{API_PORT}");
        let session = read_suite_session_document();
        let document = SuiteDiscoveryDocument {
            schema_version: SUITE_DISCOVERY_SCHEMA_VERSION,
            app_id: PULSE_APP_ID.to_string(),
            app_name: definition.app_name.to_string(),
            bundle_identifier: definition.bundle_identifier.to_string(),
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
            launch_name: definition.launch_name.to_string(),
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
