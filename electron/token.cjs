/**
 * Apple Music developer-token acquisition (Electron main process).
 *
 * Same strategy as the Tauri backend (src-tauri/src/token.rs):
 *   1. cached token still valid for >24h
 *   2. Cider token API (api.cider.sh)
 *   3. scrape the token out of the public music.apple.com web bundles
 *   4. stale cache beats nothing
 */

const fs = require("fs");
const path = require("path");

const CIDER_TOKEN_API = "https://api.cider.sh/v1/";
const APPLE_MUSIC_HOME = "https://music.apple.com/us/browse";

function jwtExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded.exp === "number" ? decoded.exp : 0;
  } catch {
    return 0;
  }
}

function cachePath(userDataDir) {
  return path.join(userDataDir, "developer-token.json");
}

function readCache(userDataDir) {
  try {
    const raw = fs.readFileSync(cachePath(userDataDir), "utf8");
    const tok = JSON.parse(raw);
    if (!tok?.token) return null;
    // refuse tokens expiring within 24h
    if (tok.expires_at && tok.expires_at < Date.now() / 1000 + 86_400) return null;
    return { ...tok, origin: "cache" };
  } catch {
    return null;
  }
}

function writeCache(userDataDir, tok) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(cachePath(userDataDir), JSON.stringify(tok, null, 2));
  } catch {
    /* cache write failures are non-fatal */
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fromCiderApi() {
  const res = await fetchWithTimeout(CIDER_TOKEN_API, {
    headers: { "User-Agent": "Cider" },
  }, 10_000);
  if (!res.ok) throw new Error(`cider api returned ${res.status}`);
  const body = await res.json();
  if (!body?.token) throw new Error("cider api returned an empty token");
  return { token: body.token, expires_at: jwtExpiry(body.token), origin: "cider-api" };
}

/** Scrape a developer token from the music.apple.com web bundles. */
async function fromAppleWeb() {
  const res = await fetchWithTimeout(APPLE_MUSIC_HOME, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    },
  });
  const html = await res.text();

  // Collect every JS asset referenced by the page (order: index bundles first).
  const assets = [];
  const re = /(?:src="|href="|")(\/assets\/[A-Za-z0-9._~-]+\.js)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (!assets.includes(match[1])) assets.push(match[1]);
  }
  assets.sort((a, b) => (b.includes("index") ? 1 : 0) - (a.includes("index") ? 1 : 0));

  if (assets.length === 0) throw new Error("no JS bundles found on music.apple.com");

  for (const asset of assets.slice(0, 8)) {
    let js = "";
    try {
      const bundleRes = await fetchWithTimeout(`https://music.apple.com${asset}`, {}, 20_000);
      js = await bundleRes.text();
    } catch {
      continue;
    }
    // Developer tokens are ES256 JWTs starting with eyJh, ~200+ chars, 3 segments.
    const tokenMatch = js.match(/["'`](eyJh[\w-]+\.[\w-]+\.[\w-]+)["'`]/);
    if (tokenMatch) {
      return { token: tokenMatch[1], expires_at: jwtExpiry(tokenMatch[1]), origin: "apple-web" };
    }
  }
  throw new Error("no developer token found in the music.apple.com bundles");
}

async function getDeveloperToken(userDataDir, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readCache(userDataDir);
    if (cached) return cached;
  }

  const errors = [];

  try {
    const tok = await fromCiderApi();
    writeCache(userDataDir, tok);
    return tok;
  } catch (err) {
    errors.push(`cider-api: ${err.message ?? err}`);
  }

  try {
    const tok = await fromAppleWeb();
    writeCache(userDataDir, tok);
    return tok;
  } catch (err) {
    errors.push(`apple-web: ${err.message ?? err}`);
  }

  // stale cache as a last resort
  try {
    const raw = fs.readFileSync(cachePath(userDataDir), "utf8");
    const tok = JSON.parse(raw);
    if (tok?.token) return { ...tok, origin: "stale-cache" };
  } catch {
    /* nothing cached */
  }

  throw new Error(errors.join(" | "));
}

module.exports = { getDeveloperToken };
