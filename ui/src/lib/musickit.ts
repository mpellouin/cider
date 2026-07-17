/**
 * MusicKit JS v3 bootstrap.
 *
 * - Fetches a developer token through the Rust backend (no CORS headaches).
 * - Installs a `window.open` shim so MusicKit's Apple-ID popup opens in a
 *   dedicated Tauri window; the auth result is relayed back by Rust as an
 *   `apple-auth-message` event and re-dispatched as a synthetic
 *   `message` event that MusicKit's own listener consumes.
 * - Detects DRM support and falls back to 30-second previews when the
 *   webview has no CDM (e.g. WebKitGTK on Linux).
 */

import { invoke, isDesktop, isTauri, listen } from "./tauri";

const MUSICKIT_CDN = "https://js-cdn.music.apple.com/musickit/v3/amp/musickit.js";
const AUTH_ORIGIN = "https://authorize.music.apple.com";
const APPLE_AUTH_HOSTS = [
  "authorize.music.apple.com",
  "idmsa.apple.com",
  "buy.itunes.apple.com",
  "appleid.apple.com",
];

export interface BootstrapProgress {
  step: "token" | "script" | "configure" | "ready" | "error";
  detail?: string;
}

export type DrmStatus = "full" | "preview-only" | "unknown";

let instance: MusicKit.MusicKitInstance | null = null;
let drmStatus: DrmStatus = "unknown";

export function mk(): MusicKit.MusicKitInstance {
  if (!instance) throw new Error("MusicKit is not ready yet");
  return instance;
}

export function mkReady(): boolean {
  return instance !== null;
}

export function getDrmStatus(): DrmStatus {
  return drmStatus;
}

/** Ask the webview whether a Widevine or FairPlay CDM is present. */
async function detectDrm(): Promise<DrmStatus> {
  const config: MediaKeySystemConfiguration[] = [
    {
      initDataTypes: ["cenc", "sinf", "skd"],
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
    },
  ];
  const systems = ["com.widevine.alpha", "com.apple.fps", "com.apple.fps.1_0"];
  for (const system of systems) {
    try {
      await navigator.requestMediaKeySystemAccess(system, config);
      return "full";
    } catch {
      /* try the next key system */
    }
  }
  return "preview-only";
}

function installAuthShim(): void {
  if (!isTauri) return; // regular popups work fine in a browser

  const stub = {
    closed: false,
    close: () => {
      stub.closed = true;
      void invoke("close_apple_auth").catch(() => {});
    },
    focus: () => {},
    postMessage: () => {},
    location: {},
  };
  window.__CIDER_AUTH_STUB__ = stub;

  const nativeOpen = window.open.bind(window);
  window.open = function (url?: string | URL, target?: string, features?: string) {
    const href = url ? String(url) : "";
    const isAppleAuth = APPLE_AUTH_HOSTS.some((host) => href.includes(host));
    if (!isAppleAuth) {
      return nativeOpen(url as any, target, features);
    }
    stub.closed = false;
    void invoke("open_apple_auth", { url: href }).catch((err) => {
      console.error("[cider] failed to open auth window:", err);
      stub.closed = true;
    });
    return stub as unknown as Window;
  } as typeof window.open;

  // Rust → synthetic `message` event that MusicKit is waiting for.
  void listen<string>("apple-auth-message", (raw) => {
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      /* forward as-is */
    }
    window.dispatchEvent(
      new MessageEvent("message", { data, origin: AUTH_ORIGIN })
    );
    // A payload carrying a music user token means the flow is done.
    const tokenish = JSON.stringify(data ?? "");
    if (tokenish.includes("musicUserToken") || tokenish.includes("music-user-token")) {
      stub.closed = true;
      void invoke("close_apple_auth").catch(() => {});
    }
  });

  void listen("apple-auth-closed", () => {
    stub.closed = true;
  });
}

function loadMusicKitScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.MusicKit) return resolve();
    const script = document.createElement("script");
    script.src = MUSICKIT_CDN;
    script.async = true;
    const timer = window.setTimeout(
      () => reject(new Error("Timed out loading MusicKit from Apple's CDN")),
      20_000
    );
    script.onload = () => {
      window.clearTimeout(timer);
      // musickitloaded can fire before or after onload depending on version.
      if (window.MusicKit) resolve();
      else document.addEventListener("musickitloaded", () => resolve(), { once: true });
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Failed to load MusicKit — check your connection"));
    };
    document.head.appendChild(script);
  });
}

interface DeveloperToken {
  token: string;
  expires_at: number;
  origin: string;
}

async function fetchDeveloperToken(forceRefresh = false): Promise<string> {
  // A manually-provided token always wins (Settings/boot-error escape hatch
  // for networks where both token sources are unreachable).
  const manual = localStorage.getItem("cider.manualToken");
  if (manual && !forceRefresh) return manual;

  if (isDesktop) {
    const res = await invoke<DeveloperToken>("fetch_developer_token", {
      forceRefresh,
    });
    localStorage.setItem("cider.devToken", res.token);
    return res.token;
  }
  // Browser dev mode: reuse whatever token we saw last, or ask Cider's API.
  const cached = localStorage.getItem("cider.devToken");
  if (cached && !forceRefresh) return cached;
  const res = await fetch("https://api.cider.sh/v1/", {
    headers: { "User-Agent": "Cider" } as Record<string, string>,
  });
  const body = await res.json();
  localStorage.setItem("cider.devToken", body.token);
  return body.token;
}

export async function bootstrapMusicKit(
  onProgress: (p: BootstrapProgress) => void
): Promise<MusicKit.MusicKitInstance> {
  if (instance) return instance;

  installAuthShim();

  onProgress({ step: "token" });
  let token: string;
  try {
    token = await fetchDeveloperToken();
  } catch (err) {
    onProgress({ step: "error", detail: `Could not obtain a developer token: ${err}` });
    throw err;
  }

  onProgress({ step: "script" });
  await loadMusicKitScript();

  onProgress({ step: "configure" });
  try {
    await window.MusicKit.configure({
      developerToken: token,
      app: { name: "Cider", build: "2.0.0", version: "2.0.0" },
      sourceType: 24,
      suppressErrorDialog: true,
    });
  } catch (err) {
    // The token may have been revoked — force-refresh once and retry.
    token = await fetchDeveloperToken(true);
    await window.MusicKit.configure({
      developerToken: token,
      app: { name: "Cider", build: "2.0.0", version: "2.0.0" },
      sourceType: 24,
      suppressErrorDialog: true,
    });
  }

  instance = window.MusicKit.getInstance();

  drmStatus = await detectDrm();
  if (drmStatus === "preview-only") {
    try {
      (instance as any).previewOnly = true;
    } catch {
      /* older MusicKit builds don't expose the setter */
    }
  }

  onProgress({ step: "ready" });
  return instance;
}

/** The user's storefront, falling back to "us" pre-authorization. */
export function storefront(): string {
  try {
    return mk().storefrontId || "us";
  } catch {
    return "us";
  }
}
