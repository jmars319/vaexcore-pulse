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

include!("suite_runtime/types.rs");
include!("suite_runtime/commands.rs");
include!("suite_runtime/discovery.rs");

#[cfg(test)]
mod tests {
    include!("suite_runtime/tests.rs");
}
