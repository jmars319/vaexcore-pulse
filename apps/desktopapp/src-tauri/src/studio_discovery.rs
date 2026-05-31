use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

use crate::platform_paths::app_data_dir_for;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StudioApiDiscovery {
    api_url: String,
    ws_url: String,
    token: Option<String>,
    discovered: bool,
    source: String,
    detail: String,
}

#[tauri::command]
pub(crate) fn studio_api_discovery() -> StudioApiDiscovery {
    let configured_api_url = env::var("VAEXCORE_STUDIO_API_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let configured_ws_url = env::var("VAEXCORE_STUDIO_WS_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let token = env::var("VAEXCORE_STUDIO_API_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let Some(api_url) = configured_api_url {
        let ws_url = configured_ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url));
        return StudioApiDiscovery {
            api_url,
            ws_url,
            token,
            discovered: true,
            source: "env".to_string(),
            detail: "Using VAEXCORE_STUDIO_API_URL.".to_string(),
        };
    }

    for discovery_path in studio_discovery_file_paths() {
        if let Ok(raw) = fs::read_to_string(&discovery_path) {
            if let Ok(document) = serde_json::from_str::<serde_json::Value>(&raw) {
                let api_url = document
                    .get("apiUrl")
                    .or_else(|| document.get("api_url"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);
                let ws_url = document
                    .get("wsUrl")
                    .or_else(|| document.get("ws_url"))
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);

                if let Some(api_url) = api_url {
                    return StudioApiDiscovery {
                        ws_url: configured_ws_url.unwrap_or_else(|| {
                            ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url))
                        }),
                        api_url,
                        token,
                        discovered: true,
                        source: "discovery_file".to_string(),
                        detail: format!("Loaded {}.", discovery_path.display()),
                    };
                }
            }
        }
    }

    let api_url = "http://127.0.0.1:51287".to_string();
    StudioApiDiscovery {
        ws_url: configured_ws_url.unwrap_or_else(|| ws_url_from_api_url(&api_url)),
        api_url,
        token,
        discovered: false,
        source: "default".to_string(),
        detail: "Studio discovery file was not found; using the default localhost URL.".to_string(),
    }
}

fn studio_discovery_file_paths() -> Vec<PathBuf> {
    vec![
        app_data_dir_for("com.vaexcore.studio").join("api-discovery.json"),
        app_data_dir_for("vaexcore studio").join("api-discovery.json"),
    ]
}

fn ws_url_from_api_url(api_url: &str) -> String {
    let base = api_url.trim_end_matches('/');
    let ws_base = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        base.to_string()
    };
    format!("{}/events", ws_base.trim_end_matches('/'))
}
