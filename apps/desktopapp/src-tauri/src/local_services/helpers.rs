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
