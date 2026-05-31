use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::Runtime;

#[cfg(not(any(
    target_os = "macos",
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
)))]
use crate::MENU_CLOSE_MAIN_FILE;
use crate::{
    APP_NAME, MENU_CLOSE_MAIN, MENU_LAUNCH_SUITE, MENU_OPEN_PROFILE_SETUP, MENU_OPEN_SETTINGS,
    MENU_QUIT_APP, MENU_SHOW_MAIN,
};

pub(crate) fn build_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
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
