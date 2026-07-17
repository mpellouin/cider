<div align="center">
<picture>
    <img src="resources/icons/icon.png" width="128px">
</picture>
</div>
<h1 align="center">
Cider — Tauri Edition
</h1>

<p align="center">A delightful, cross-platform <b>Apple Music</b> client — now rebuilt on <a href="https://tauri.app">Tauri 2</a>, <a href="https://vuejs.org">Vue 3</a> and Rust.</p>

---

## ✨ What's new in the Tauri port

This branch ports the original Electron/Vue 2 codebase to a modern stack:

| | Electron (v1.x) | Tauri (this port) |
|---|---|---|
| Backend | Node.js main process | **Rust** (`src-tauri/`) |
| Frontend | Vue 2 + EJS + Less | **Vue 3 + TypeScript + Vite + Pinia** (`ui/`) |
| Bundle size | ~200 MB | a few MB (system webview) |
| Memory | Chromium per app | shared OS webview |

### Features

- 🎵 **Full Apple Music catalog** — Listen Now, Browse charts, live Radio, Search, your Library and Playlists via MusicKit JS v3
- 🪩 **Immersive Now Playing** — animated ambient artwork backdrop, oversized controls
- 🎤 **Time-synced lyrics** — Apple TTML lyrics with active-line highlight, click-to-seek and a focus blur effect
- 🎨 **Dynamic accent color** — the whole UI tints itself from the current artwork's palette
- ⌘K **Command palette** — instant search-and-play from anywhere
- 📊 **Listening Stats** — private, on-device listening telemetry (minutes/day, top songs & artists) + Apple Heavy Rotation
- 🟣 **Discord Rich Presence** — "Listening to…" activity with artwork and an *Listen on Apple Music* button (Rust-native IPC)
- ⌨️ **Media keys** — MediaSession integration + optional global shortcuts that work in the background
- ❤️ Love/rate songs, add albums & playlists to your library, queue management, shuffle/repeat
- 🌗 Dark / light / auto themes, reduced-motion mode, custom titlebar

### Platform notes on playback (DRM)

MusicKit needs a content-decryption module for full songs:

- **Windows** (WebView2) → full playback (Widevine/PlayReady ship with Edge runtime)
- **macOS** (WKWebView) → full playback (FairPlay)
- **Linux** (WebKitGTK) → no CDM available; Cider automatically falls back to **30-second previews** and tells you so in Settings

Apple-ID sign-in works everywhere: Cider opens the Apple auth popup in a dedicated
Tauri window and relays MusicKit's postMessage handshake through Rust
(see `src-tauri/src/lib.rs`).

## 🚀 Getting started

Prerequisites: [Node 20+, pnpm](https://pnpm.io), [Rust](https://rustup.rs), and the
[Tauri Linux dependencies](https://tauri.app/start/prerequisites/) if you're on Linux
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, …).

```bash
pnpm run tauri:setup   # install ui/ dependencies
pnpm run tauri:dev     # run the desktop app with hot reload
pnpm run tauri:build   # produce installers/bundles
```

Frontend-only development (runs in a normal browser, no Rust needed):

```bash
pnpm run ui:dev
```

## 🗂 Repository layout

```
src-tauri/   Rust backend: token acquisition, Apple auth window, Discord RPC
ui/          Vue 3 + TypeScript frontend (Vite, Pinia, vue-router)
src/         Legacy Electron/Vue 2 sources (kept for reference)
docs/        Documentation, incl. the Tauri migration notes
```

See [docs/TAURI_MIGRATION.md](docs/TAURI_MIGRATION.md) for the architecture of the
port and how the tricky parts (developer tokens, Apple sign-in, DRM detection) work.

## Legacy Cider v1 (Electron)

The original Electron/Vue 2 sources remain in `src/` and still build with the
legacy scripts (`pnpm start`, `pnpm dist`). The upstream v1 project is archived —
this port is the way forward for this repository.
