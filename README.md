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

### Two shells, one UI — pick by platform (DRM)

Full-length Apple Music playback needs a content-decryption module, and that
dictates which shell to run:

| Shell | Linux | Windows | macOS | Weight |
|---|---|---|---|---|
| **Electron (castLabs Widevine)** — `electron/` | ✅ full playback | ✅ full playback | ✅ full playback | heavy |
| **Tauri** — `src-tauri/` | ⚠️ 30s previews (WebKitGTK has no CDM) | ✅* (WebView2) | ✅* (FairPlay) | tiny |

*subject to the OS webview exposing its CDM.

**On Linux, use the Electron shell** — it embeds the same castLabs
Widevine-enabled Electron the original Cider used, so full playback works.
The Vue UI is identical in both shells (`ui/src/lib/tauri.ts` abstracts the
bridge); the Tauri shell remains the lightweight option for Windows/macOS.

Apple-ID sign-in works in both: natively via popups in Electron, and through a
dedicated auth window + postMessage relay in Tauri (see `src-tauri/src/lib.rs`).

## 🚀 Getting started

Prerequisites: [Node 20+, pnpm](https://pnpm.io).

### Electron shell (full playback everywhere, recommended on Linux)

```bash
pnpm run shell:setup   # install ui/ + electron/ deps (downloads castLabs Electron)
pnpm run shell:dev     # dev mode: Vite hot reload + Electron
pnpm run shell:start   # production mode: build ui/ then launch
```

### Tauri shell (lightweight, Windows/macOS)

Also needs [Rust](https://rustup.rs) and, on Linux, the
[Tauri system dependencies](https://tauri.app/start/prerequisites/)
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, …).

```bash
pnpm run tauri:setup   # install ui/ dependencies
pnpm run tauri:dev     # run the desktop app with hot reload
pnpm run tauri:build   # produce installers/bundles
```

### Frontend only (any browser, no native toolchain)

```bash
pnpm run ui:dev
```

### Token troubleshooting

Cider fetches an Apple Music developer token automatically (Cider API, then
scraping the public web player). If both fail on your network, the boot screen
lets you paste a token manually (stored locally).

## 🗂 Repository layout

```
ui/          Vue 3 + TypeScript frontend (Vite, Pinia, vue-router) — shared by both shells
electron/    castLabs Electron (Widevine) shell: full DRM playback on every OS
src-tauri/   Tauri/Rust shell: token acquisition, Apple auth window, Discord RPC
src/         Legacy Electron/Vue 2 sources (kept for reference)
docs/        Documentation, incl. the migration notes
```

See [docs/TAURI_MIGRATION.md](docs/TAURI_MIGRATION.md) for the architecture of the
port and how the tricky parts (developer tokens, Apple sign-in, DRM detection) work.

## Legacy Cider v1 (Electron)

The original Electron/Vue 2 sources remain in `src/` and still build with the
legacy scripts (`pnpm start`, `pnpm dist`). The upstream v1 project is archived —
this port is the way forward for this repository.
