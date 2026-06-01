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
