use std::env;
use std::fs::{self, OpenOptions};
use std::net::{SocketAddr, TcpStream};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{Manager, Runtime};

use crate::platform_paths::vaexcore_shared_data_dir;

pub(crate) const ANALYZER_PORT: u16 = 9010;
pub(crate) const API_PORT: u16 = 4010;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const DETACHED_PROCESS: u32 = 0x00000008;

#[derive(Default)]
pub(crate) struct ManagedLocalServices {
    analyzer: Option<Child>,
    api: Option<Child>,
}

struct SpawnedLocalService {
    child: Child,
    log_path: PathBuf,
}

pub(crate) fn suppress_windows_console(_command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        _command.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
}

#[derive(Debug)]
pub(crate) struct PulseHelperPaths {
    pub(crate) analyzer_source_dir: PathBuf,
    pub(crate) api_working_dir: PathBuf,
    pub(crate) api_launch: ApiBridgeLaunch,
    pub(crate) source: PulseHelperSource,
}

#[derive(Debug)]
pub(crate) enum ApiBridgeLaunch {
    BundledScript { script: PathBuf },
    TsxSource { cli: PathBuf, script: PathBuf },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PulseHelperSource {
    EnvRepo,
    PackagedResources,
    DevRepo,
}

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

pub(crate) fn resolve_pulse_helper_paths_from_candidates(
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

pub(crate) fn helper_service_bundle_state() -> &'static str {
    match helper_service_source_for_status() {
        Some(PulseHelperSource::PackagedResources) => "available",
        Some(PulseHelperSource::EnvRepo) => "repo-override",
        Some(PulseHelperSource::DevRepo) => "dev-fallback",
        None => "missing",
    }
}

pub(crate) fn helper_service_bundle_detail() -> String {
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

pub(crate) fn find_executable(name: &str, fallback_paths: &[&str]) -> Option<PathBuf> {
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

pub(crate) fn port_is_open(port: u16) -> bool {
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
