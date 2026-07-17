//! Discord Rich Presence — "Listening to Apple Music" style activity.
//!
//! The client connects lazily on the first activity update and reconnects
//! transparently if Discord restarts.

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;
use std::sync::Mutex;

/// Cider's public Discord application id (same one the Electron app used).
const DISCORD_APP_ID: &str = "911790844204437504";

#[derive(Default)]
pub struct DiscordState {
    client: Mutex<Option<DiscordIpcClient>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresencePayload {
    pub details: String,
    pub state: String,
    #[serde(default)]
    pub large_image: Option<String>,
    #[serde(default)]
    pub large_text: Option<String>,
    #[serde(default)]
    pub start_ms: Option<i64>,
    #[serde(default)]
    pub end_ms: Option<i64>,
    #[serde(default)]
    pub song_url: Option<String>,
}

fn ensure_connected(slot: &mut Option<DiscordIpcClient>) -> Result<(), String> {
    if slot.is_none() {
        let mut client =
            DiscordIpcClient::new(DISCORD_APP_ID).map_err(|e| e.to_string())?;
        client.connect().map_err(|e| e.to_string())?;
        *slot = Some(client);
    }
    Ok(())
}

pub fn set_activity(state: &DiscordState, payload: PresencePayload) -> Result<(), String> {
    let mut slot = state.client.lock().map_err(|e| e.to_string())?;
    ensure_connected(&mut slot)?;

    // Discord truncates / rejects strings shorter than 2 chars.
    let pad = |s: &str| -> String {
        let mut s = s.to_string();
        while s.chars().count() < 2 {
            s.push(' ');
        }
        s.chars().take(128).collect()
    };

    let details = pad(&payload.details);
    let state_line = pad(&payload.state);

    let mut activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .details(&details)
        .state(&state_line);

    let mut assets = Assets::new();
    if let Some(img) = payload.large_image.as_deref() {
        assets = assets.large_image(img);
    }
    let large_text = payload.large_text.clone().unwrap_or_default();
    if !large_text.is_empty() {
        assets = assets.large_text(&large_text);
    }
    activity = activity.assets(assets);

    let mut timestamps = Timestamps::new();
    let mut has_ts = false;
    if let Some(start) = payload.start_ms {
        timestamps = timestamps.start(start);
        has_ts = true;
    }
    if let Some(end) = payload.end_ms {
        timestamps = timestamps.end(end);
        has_ts = true;
    }
    if has_ts {
        activity = activity.timestamps(timestamps);
    }

    let buttons: Vec<Button> = payload
        .song_url
        .as_deref()
        .map(|url| vec![Button::new("Listen on Apple Music", url)])
        .unwrap_or_default();
    if !buttons.is_empty() {
        activity = activity.buttons(buttons);
    }

    let result = slot
        .as_mut()
        .expect("client just connected")
        .set_activity(activity);

    if result.is_err() {
        // Discord probably restarted — drop the connection and retry once.
        *slot = None;
        ensure_connected(&mut slot)?;
        let retry_activity = Activity::new()
            .activity_type(ActivityType::Listening)
            .details(&details)
            .state(&state_line);
        slot.as_mut()
            .expect("client just reconnected")
            .set_activity(retry_activity)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn clear_activity(state: &DiscordState) -> Result<(), String> {
    let mut slot = state.client.lock().map_err(|e| e.to_string())?;
    if let Some(client) = slot.as_mut() {
        client.clear_activity().map_err(|e| {
            let msg = e.to_string();
            msg
        })?;
    }
    Ok(())
}

pub fn disconnect(state: &DiscordState) {
    if let Ok(mut slot) = state.client.lock() {
        if let Some(mut client) = slot.take() {
            let _ = client.close();
        }
    }
}
