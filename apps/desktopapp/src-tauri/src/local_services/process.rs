pub(crate) fn ensure_local_services<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
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

pub(crate) fn stop_local_services<R: Runtime>(app: &tauri::AppHandle<R>) {
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
