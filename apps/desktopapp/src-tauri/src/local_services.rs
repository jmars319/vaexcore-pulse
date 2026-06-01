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

include!("local_services/process.rs");
include!("local_services/helpers.rs");
include!("local_services/runtime.rs");
