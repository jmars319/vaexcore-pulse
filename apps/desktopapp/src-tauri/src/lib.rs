use std::sync::Mutex;
use std::thread;
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

mod app_menu;
mod local_services;
mod media_preview;
mod platform_paths;
mod studio_discovery;
mod suite_protocol;
mod suite_runtime;

use app_menu::build_app_menu;
use local_services::{ensure_local_services, stop_local_services, ManagedLocalServices};
use media_preview::{inspect_media_playback, open_media_in_quicktime, prepare_media_preview_clip};
use studio_discovery::studio_api_discovery;
use suite_runtime::{
    append_suite_timeline, consume_pulse_recording_handoff, consume_suite_commands,
    launch_vaexcore_suite, start_suite_discovery_heartbeat, suite_session, suite_status,
    suite_timeline,
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

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle, section: Option<String>) -> Result<(), String> {
    open_settings_window_for(&app, section.as_deref())
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
