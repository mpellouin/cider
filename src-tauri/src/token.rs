//! Apple Music developer-token acquisition.
//!
//! Strategy (in order):
//!   1. A cached, still-valid token stored in the app config directory.
//!   2. The Cider token API (`api.cider.sh`).
//!   3. Scraping a token straight out of the music.apple.com web bundle.
//!
//! All network work happens here in Rust so the webview never has to fight
//! CORS for token bootstrap.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const CIDER_TOKEN_API: &str = "https://api.cider.sh/v1/";
const APPLE_MUSIC_HOME: &str = "https://music.apple.com/us/browse";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeveloperToken {
    pub token: String,
    /// Unix seconds. 0 when unknown.
    pub expires_at: i64,
    /// Where the token came from: "cache" | "cider-api" | "apple-web" | "manual"
    pub origin: String,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Cider/2.0.0 (Tauri; +https://cider.sh)")
        .build()
        .map_err(|e| e.to_string())
}

/// Extract the `exp` claim from a JWT without verifying the signature —
/// we only need it to know when to refresh.
pub fn jwt_expiry(token: &str) -> i64 {
    let payload = match token.split('.').nth(1) {
        Some(p) => p,
        None => return 0,
    };
    let decoded = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload) {
        Ok(d) => d,
        Err(_) => return 0,
    };
    serde_json::from_slice::<serde_json::Value>(&decoded)
        .ok()
        .and_then(|v| v.get("exp").and_then(|e| e.as_i64()))
        .unwrap_or(0)
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn cache_path(config_dir: &PathBuf) -> PathBuf {
    config_dir.join("developer-token.json")
}

fn read_cache(config_dir: &PathBuf) -> Option<DeveloperToken> {
    let raw = std::fs::read_to_string(cache_path(config_dir)).ok()?;
    let mut tok: DeveloperToken = serde_json::from_str(&raw).ok()?;
    // Refuse tokens that expire within the next 24 hours.
    if tok.expires_at != 0 && tok.expires_at < now_unix() + 86_400 {
        return None;
    }
    tok.origin = "cache".into();
    Some(tok)
}

fn write_cache(config_dir: &PathBuf, token: &DeveloperToken) {
    if std::fs::create_dir_all(config_dir).is_ok() {
        let _ = std::fs::write(
            cache_path(config_dir),
            serde_json::to_string_pretty(token).unwrap_or_default(),
        );
    }
}

async fn from_cider_api() -> Result<DeveloperToken, String> {
    #[derive(Deserialize)]
    struct CiderResponse {
        token: String,
    }
    let client = http_client()?;
    let res = client
        .get(CIDER_TOKEN_API)
        .header("User-Agent", "Cider")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("cider api returned {}", res.status()));
    }
    let body: CiderResponse = res.json().await.map_err(|e| e.to_string())?;
    if body.token.is_empty() {
        return Err("cider api returned an empty token".into());
    }
    let expires_at = jwt_expiry(&body.token);
    Ok(DeveloperToken {
        token: body.token,
        expires_at,
        origin: "cider-api".into(),
    })
}

/// Scrape a developer token from the public music.apple.com web bundle.
async fn from_apple_web() -> Result<DeveloperToken, String> {
    let client = http_client()?;
    let html = client
        .get(APPLE_MUSIC_HOME)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    // Collect every JS asset referenced by the page, index bundles first —
    // the token usually lives in the main chunk but not always.
    let mut bundles: Vec<String> = Vec::new();
    for chunk in html.split('"') {
        if chunk.starts_with("/assets/") && chunk.ends_with(".js") && !bundles.contains(&chunk.to_string()) {
            bundles.push(chunk.to_string());
        }
    }
    bundles.sort_by_key(|b| !b.contains("index"));
    if bundles.is_empty() {
        return Err("could not locate a music.apple.com JS bundle".into());
    }

    for bundle in bundles.iter().take(8) {
        let js = match client
            .get(format!("https://music.apple.com{bundle}"))
            .timeout(std::time::Duration::from_secs(20))
            .send()
            .await
        {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => continue,
        };
        if let Some(token) = extract_jwt(&js) {
            return Ok(DeveloperToken {
                expires_at: jwt_expiry(&token),
                token,
                origin: "apple-web".into(),
            });
        }
    }
    Err("no developer token found in the music.apple.com bundles".into())
}

/// Find the first ES256-JWT-looking string ("eyJh…", three dot-separated
/// base64url segments of plausible length) anywhere in a JS bundle.
fn extract_jwt(js: &str) -> Option<String> {
    let bytes = js.as_bytes();
    let mut start = 0;
    while let Some(idx) = js[start..].find("eyJh") {
        let begin = start + idx;
        let end = js[begin..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-'))
            .map(|off| begin + off)
            .unwrap_or(js.len());
        let candidate = &js[begin..end];
        let segments: Vec<&str> = candidate.split('.').collect();
        if segments.len() == 3
            && segments.iter().all(|s| s.len() >= 16)
            && candidate.len() >= 100
        {
            return Some(candidate.to_string());
        }
        start = begin + 4;
        if start >= bytes.len() {
            break;
        }
    }
    None
}

pub async fn acquire(config_dir: PathBuf, force_refresh: bool) -> Result<DeveloperToken, String> {
    if !force_refresh {
        if let Some(cached) = read_cache(&config_dir) {
            return Ok(cached);
        }
    }

    let mut errors: Vec<String> = Vec::new();

    match from_cider_api().await {
        Ok(tok) => {
            write_cache(&config_dir, &tok);
            return Ok(tok);
        }
        Err(e) => errors.push(format!("cider-api: {e}")),
    }

    match from_apple_web().await {
        Ok(tok) => {
            write_cache(&config_dir, &tok);
            return Ok(tok);
        }
        Err(e) => errors.push(format!("apple-web: {e}")),
    }

    // Last resort: an expired-ish cache beats nothing at all.
    if let Ok(raw) = std::fs::read_to_string(cache_path(&config_dir)) {
        if let Ok(tok) = serde_json::from_str::<DeveloperToken>(&raw) {
            return Ok(tok);
        }
    }

    Err(errors.join(" | "))
}
