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

// api.cider.sh sits behind Cloudflare and rejects non-browser clients, so we
// must present as a real Chrome — and route through Electron's `net` (the
// Chromium network stack) rather than Node's fetch, which Cloudflare
// fingerprints and blocks. This is why the legacy app fetched the token from
// a browser context.
const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/**
 * Fetch text over Electron's Chromium network stack (falls back to Node fetch
 * if the `net` module isn't available for some reason).
 */
async function netFetch(url, { headers = {}, timeoutMs = 15_000 } = {}) {
  let net;
  try {
    ({ net } = require("electron"));
  } catch {
    net = null;
  }

  if (!net) {
    const res = await fetchWithTimeout(url, { headers }, timeoutMs);
    return { status: res.status, ok: res.ok, text: await res.text() };
  }

  return new Promise((resolve, reject) => {
    const request = net.request({ method: "GET", url, redirect: "follow" });
    for (const [k, v] of Object.entries(headers)) request.setHeader(k, v);
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    request.on("response", (response) => {
      const chunks = [];
      response.on("data", (c) => chunks.push(c));
      response.on("end", () => {
        clearTimeout(timer);
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, ok: response.statusCode < 400, text });
      });
    });
    request.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

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
  const res = await netFetch(CIDER_TOKEN_API, {
    headers: {
      "User-Agent": CHROME_UA,
      Accept: "application/json, text/plain, */*",
      Origin: "https://cider.sh",
      Referer: "https://cider.sh/",
    },
    timeoutMs: 12_000,
  });
  if (!res.ok) throw new Error(`cider api returned ${res.status}`);
  let body;
  try {
    body = JSON.parse(res.text);
  } catch {
    throw new Error("cider api returned non-JSON");
  }
  if (!body?.token) throw new Error("cider api returned an empty token");
  return { token: body.token, expires_at: jwtExpiry(body.token), origin: "cider-api" };
}

/** Scrape a developer token from music.apple.com (meta tag or JS bundles). */
async function fromAppleWeb() {
  const res = await netFetch(APPLE_MUSIC_HOME, {
    headers: { "User-Agent": SAFARI_UA },
    timeoutMs: 20_000,
  });
  const html = res.text;

  // Modern music.apple.com embeds the token in a config meta tag:
  //   <meta name="desktop-music-app/config/environment" content="<url-encoded JSON>">
  // The JSON has MEDIA_API.token.
  const metaToken = tokenFromEnvironmentMeta(html);
  if (metaToken) {
    return { token: metaToken, expires_at: jwtExpiry(metaToken), origin: "apple-web-meta" };
  }
  const inlineToken = extractJwt(html);
  if (inlineToken) {
    return { token: inlineToken, expires_at: jwtExpiry(inlineToken), origin: "apple-web-html" };
  }

  // Otherwise dig through the JS bundles.
  const assets = [];
  const re = /(?:src="|href="|")(\/assets\/[A-Za-z0-9._~-]+\.js)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    if (!assets.includes(match[1])) assets.push(match[1]);
  }
  assets.sort((a, b) => (b.includes("index") ? 1 : 0) - (a.includes("index") ? 1 : 0));

  if (assets.length === 0) throw new Error("no JS bundles found on music.apple.com");

  for (const asset of assets.slice(0, 10)) {
    let js = "";
    try {
      const bundleRes = await netFetch(`https://music.apple.com${asset}`, {
        headers: { "User-Agent": SAFARI_UA },
        timeoutMs: 20_000,
      });
      js = bundleRes.text;
    } catch {
      continue;
    }
    const token = extractJwt(js);
    if (token) {
      return { token, expires_at: jwtExpiry(token), origin: "apple-web" };
    }
  }
  throw new Error("no developer token found in the music.apple.com bundles");
}

function tokenFromEnvironmentMeta(html) {
  const m = html.match(
    /<meta[^>]+name="desktop-music-app\/config\/environment"[^>]+content="([^"]+)"/
  );
  if (!m) return null;
  try {
    const json = JSON.parse(decodeURIComponent(m[1]));
    const token = json?.MEDIA_API?.token || json?.mediaApi?.token || json?.MEDIA_API?.developerToken;
    if (typeof token === "string" && token.startsWith("eyJ")) return token;
  } catch {
    /* not the shape we expected */
  }
  return null;
}

/** First plausible ES256 JWT ("eyJh…", three ≥16-char base64url segments). */
function extractJwt(text) {
  const re = /eyJh[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g;
  const m = re.exec(text);
  return m ? m[0] : null;
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
