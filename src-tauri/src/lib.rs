mod discord;
mod token;

use std::sync::Arc;
use tauri::{Emitter, Listener, Manager};

/// Fake `window.opener` for the Apple auth popup.
///
/// MusicKit's `authorize()` opens a popup that reports its result through
/// `window.opener.postMessage(...)`. Tauri windows have no opener
/// relationship, so we inject one whose `postMessage` smuggles the payload
/// out through a navigation to a sentinel URL that Rust intercepts below.
const AUTH_OPENER_SHIM: &str = r#"
(function () {
  const forward = function (data) {
    try {
      const payload = encodeURIComponent(JSON.stringify(data === undefined ? null : data));
      window.location.href = "https://callback.cider.invalid/auth#" + payload;
    } catch (e) { /* non-serialisable payloads are of no use to us */ }
  };
  try {
    Object.defineProperty(window, "opener", {
      configurable: true,
      get: function () {
        return { postMessage: forward, closed: false, focus: function () {} };
      },
      set: function () {},
    });
  } catch (e) {
    window.opener = { postMessage: forward, closed: false, focus: function () {} };
  }
})();
"#;

const AUTH_WINDOW_LABEL: &str = "apple-auth";
const AUTH_CALLBACK_HOST: &str = "callback.cider.invalid";

#[tauri::command]
async fn fetch_developer_token(
    app: tauri::AppHandle,
    force_refresh: Option<bool>,
) -> Result<token::DeveloperToken, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    token::acquire(config_dir, force_refresh.unwrap_or(false)).await
}

/// Open the Apple sign-in popup requested by MusicKit.
#[tauri::command]
async fn open_apple_auth(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("auth url must be https".into());
    }
    // Only Apple domains may be loaded in the auth window.
    let host = url
        .split('/')
        .nth(2)
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let apple_host = host == "apple.com"
        || host.ends_with(".apple.com")
        || host == "icloud.com"
        || host.ends_with(".icloud.com");
    if !apple_host {
        return Err(format!("refusing to open non-Apple auth host: {host}"));
    }

    // Re-use an existing auth window if one is already up.
    if let Some(existing) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        let _ = existing.close();
    }

    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    let nav_handle = app.clone();

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        AUTH_WINDOW_LABEL,
        tauri::WebviewUrl::External(parsed),
    )
    .title("Sign in with Apple")
    .inner_size(560.0, 720.0)
    .center()
    .initialization_script(AUTH_OPENER_SHIM)
    .on_navigation(move |nav_url: &tauri::Url| {
        if nav_url.host_str() == Some(AUTH_CALLBACK_HOST) {
            let fragment = nav_url.fragment().unwrap_or("").to_string();
            let decoded = urlencoding::decode(&fragment)
                .map(|c| c.into_owned())
                .unwrap_or(fragment);
            let _ = nav_handle.emit_to("main", "apple-auth-message", decoded);
            return false; // never actually navigate to the sentinel
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Tell the renderer if the user closes the popup by hand so MusicKit's
    // authorize() promise can settle.
    let close_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = close_handle.emit_to("main", "apple-auth-closed", ());
        }
    });

    Ok(())
}

#[tauri::command]
async fn close_apple_auth(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(AUTH_WINDOW_LABEL) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn discord_set_activity(
    state: tauri::State<'_, Arc<discord::DiscordState>>,
    payload: discord::PresencePayload,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::set_activity(&state, payload))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn discord_clear_activity(
    state: tauri::State<'_, Arc<discord::DiscordState>>,
) -> Result<(), String> {
    let state = Arc::clone(&state);
    tauri::async_runtime::spawn_blocking(move || discord::clear_activity(&state))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let discord_state: Arc<discord::DiscordState> = Arc::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(discord_state)
        .invoke_handler(tauri::generate_handler![
            fetch_developer_token,
            open_apple_auth,
            close_apple_auth,
            discord_set_activity,
            discord_clear_activity,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            // Drop the Discord connection cleanly when the app exits.
            app.listen("tauri://close-requested", move |_| {
                let state: tauri::State<Arc<discord::DiscordState>> = handle.state();
                discord::disconnect(&state);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cider");
}
