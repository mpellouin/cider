# Cider → Tauri migration notes

This document explains how the Tauri port is put together and why the
non-obvious parts look the way they do.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Tauri (Rust) — src-tauri/                                  │
│                                                            │
│  token.rs    developer-token acquisition + cache           │
│  lib.rs      Apple auth window + command registration      │
│  discord.rs  Discord Rich Presence over local IPC          │
│                                                            │
│  plugins: single-instance, window-state, global-shortcut,  │
│           opener                                           │
└──────────────────────────▲─────────────────────────────────┘
                           │ invoke / events
┌──────────────────────────┴─────────────────────────────────┐
│ WebView — ui/ (Vue 3 + TS + Pinia + Vite)                  │
│                                                            │
│  lib/musickit.ts   MusicKit v3 bootstrap + auth shim       │
│  lib/api.ts        Apple Music API wrappers                │
│  lib/lyrics.ts     TTML parsing (synced lyrics)            │
│  stores/player.ts  playback state, queue, accent, lyrics   │
│  stores/stats.ts   on-device listening statistics          │
│  MusicKit JS v3 (Apple CDN) does auth + playback (EME)     │
└────────────────────────────────────────────────────────────┘
```

## The three hard problems

### 1. Developer token

MusicKit needs a developer token before it can do anything. The webview can't
fetch one cross-origin, so the Rust command `fetch_developer_token`:

1. returns a **cached** token from the app config dir if it's valid for >24h;
2. asks the **Cider token API** (`api.cider.sh`, same source the Electron app used);
3. falls back to **scraping the public music.apple.com web bundle** for the
   token Apple ships to its own web client;
4. as a last resort returns an expired cache entry rather than nothing.

The JWT `exp` claim is decoded (unverified) to know when to refresh.

### 2. Apple-ID sign-in without popups

`music.authorize()` calls `window.open()` and waits for the popup to
`window.opener.postMessage()` the music-user-token back. Tauri webviews have no
native popup support, so:

1. `ui/src/lib/musickit.ts` replaces `window.open` for Apple auth URLs with an
   `invoke("open_apple_auth", { url })` and returns a stub `Window` object
   (MusicKit polls `.closed` on it).
2. Rust opens a dedicated `WebviewWindow` restricted to `*.apple.com` /
   `*.icloud.com` and injects an **initialization script that fakes
   `window.opener`**: its `postMessage` serialises the payload and navigates to
   the sentinel URL `https://callback.cider.invalid/auth#<payload>`.
3. The window's `on_navigation` handler intercepts that sentinel, cancels the
   navigation, and emits the payload to the main window as an
   `apple-auth-message` event.
4. The frontend re-dispatches it as a **synthetic `MessageEvent`** with
   `origin: "https://authorize.music.apple.com"` — exactly what MusicKit's
   listener expects — and the `authorize()` promise resolves normally.

If the user closes the popup, a `Destroyed` window event flips the stub's
`.closed` flag so MusicKit's promise settles instead of hanging.

### 3. DRM / playback capability

Full-length Apple Music playback requires EME + a platform CDM:

| Platform | WebView | CDM | Result |
|---|---|---|---|
| Windows | WebView2 (Chromium/Edge) | Widevine/PlayReady | full playback |
| macOS | WKWebView (Safari) | FairPlay | full playback |
| Linux | WebKitGTK | none | 30-second previews |

At boot, `detectDrm()` probes `navigator.requestMediaKeySystemAccess` for
`com.widevine.alpha` and `com.apple.fps`. Without a CDM, Cider sets MusicKit's
`previewOnly` flag and shows a banner + a Settings entry explaining the
limitation, rather than failing playback with cryptic errors.

## Feature parity with the Electron app

| Electron plugin | Tauri equivalent |
|---|---|
| `discordrpc.ts` | `src-tauri/src/discord.rs` (native Rust IPC, `Listening` activity type) |
| `lastfm.ts` | not ported yet (planned; needs API keys) |
| `mpris.ts` | MediaSession API (WebKitGTK exposes it to MPRIS on Linux) |
| `menubar.ts` / `thumbar.ts` | custom titlebar + OS media controls |
| `chromecast.ts` / `raop.ts` | not ported (out of scope for the initial port) |
| web remote | not ported |

## New features not in the Electron app

- **Listening Stats** (`ui/src/views/StatsView.vue`): private, on-device
  telemetry — minutes per day (14-day chart), top songs/artists, all-time
  counters — combined with Apple's heavy-rotation feed.
- **⌘K command palette**: debounced instant search, keyboard-first play/open.
- **Dynamic accent**: dominant-color extraction from artwork
  (`ui/src/lib/artwork.ts`) drives the entire UI palette via CSS variables.
- **Synced lyrics**: TTML from the Apple Music API parsed into timed lines with
  auto-scroll, click-to-seek, and a focus-blur "stage" effect.

## Development

```bash
pnpm run tauri:setup    # once: install ui deps
pnpm run tauri:dev      # desktop app, hot reload
pnpm run ui:dev         # frontend only, in a browser
pnpm run ui:build       # type-check (vue-tsc) + vite build
cd src-tauri && cargo check   # backend type-check
```

The frontend degrades gracefully in a plain browser (`isTauri` guard in
`ui/src/lib/tauri.ts`), which keeps UI iteration fast.

## Addendum: the Electron-Widevine shell (`electron/`)

Reality check after the port: **WebKitGTK ships no Widevine/FairPlay CDM and
cannot load one** without rebuilding WebKitGTK itself with an OpenCDM backend —
not viable for a distributable desktop app. That is precisely why the original
Cider used `castlabs/electron-releases` (Chromium + Widevine).

So the repo now ships **two shells around the same `ui/` frontend**:

- `electron/` — castLabs Electron (`v32.2.6+wvcus`), Widevine included.
  Full playback on Linux/Windows/macOS. MusicKit popups work natively
  (`setWindowOpenHandler` allows Apple domains); `origin`/`referer` headers are
  spoofed to `beta.music.apple.com` on `apple.com` requests, same as legacy.
  Bridge exposed by `preload.cjs` as `window.cider` (token fetch, window
  controls, Discord RPC via discord-auto-rpc, global media keys).
- `src-tauri/` — the lightweight shell; on Linux it is preview-only.

`ui/src/lib/tauri.ts` is the single abstraction point: it detects
`__TAURI_INTERNALS__` vs `window.cider` vs plain browser, and maps the same
command names onto whichever bridge exists. Nothing else in the UI knows which
shell it runs in.
