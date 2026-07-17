/**
 * Cider Electron shell — hosts the new Vue 3 UI (ui/) inside castLabs
 * Electron, whose bundled Widevine CDM enables full Apple Music playback
 * on Linux, Windows and macOS alike.
 *
 * Dev:   pnpm --dir ui dev   +   electron . --dev   (loads localhost:1420)
 * Prod:  electron .            (serves ../ui/dist over http://localhost)
 */

const { app, BrowserWindow, components, globalShortcut, ipcMain, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const token = require("./token.cjs");
const discord = require("./discord.cjs");
const { startStaticServer } = require("./server.cjs");

const DEV = process.argv.includes("--dev");
const DEV_URL = process.env.CIDER_DEV_URL || "http://localhost:1420";
const UI_DIST_DIR = path.join(__dirname, "..", "ui", "dist");

/** @type {BrowserWindow | null} */
let win = null;
/** @type {import("http").Server | null} */
let staticServer = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

function spoofAppleHeaders() {
  // MusicKit calls amp-api.music.apple.com from a file:// (or localhost)
  // origin; Apple only accepts its own web origins, so present ourselves as
  // the beta web player — same trick the legacy Electron app used.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (details.url.includes("apple.com")) {
      headers["origin"] = "https://beta.music.apple.com";
      headers["referer"] = "https://beta.music.apple.com";
      headers["sec-fetch-site"] = "same-site";
      headers["sec-fetch-mode"] = "cors";
      headers["sec-fetch-dest"] = "empty";
      headers["DNT"] = "1";
    }
    callback({ requestHeaders: headers });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    backgroundColor: "#0f0f13",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Required for cross-origin MusicKit/amp-api calls from our origin and
      // for canvas access to artwork (dynamic accent extraction).
      webSecurity: false,
      allowRunningInsecureContent: false,
      plugins: true, // Widevine
    },
  });

  // MusicKit's Apple-ID sign-in uses window.open + postMessage: allow Apple
  // domains as real popups (opener relationship intact), push everything
  // else to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      return { action: "deny" };
    }
    const appleish =
      host === "apple.com" ||
      host.endsWith(".apple.com") ||
      host === "icloud.com" ||
      host.endsWith(".icloud.com") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (appleish) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 560,
          height: 720,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
        },
      };
    }
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
  });

  win.on("maximize", () => win?.webContents.send("cider:maximized-change", true));
  win.on("unmaximize", () => win?.webContents.send("cider:maximized-change", false));

  if (DEV) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Serve over http://localhost so MusicKit has a real web origin
    // (Apple sign-in rejects file://). Falls back to file:// if the tiny
    // static server can't start for some reason.
    startStaticServer(UI_DIST_DIR)
      .then(({ url, server }) => {
        staticServer = server;
        win?.loadURL(url);
      })
      .catch((err) => {
        console.warn("[cider] static server failed, falling back to file://:", err?.message ?? err);
        win?.loadFile(path.join(UI_DIST_DIR, "index.html"));
      });
  }
}

function registerIpc() {
  ipcMain.handle("cider:get-token", async (_event, forceRefresh) => {
    return token.getDeveloperToken(app.getPath("userData"), Boolean(forceRefresh));
  });

  ipcMain.handle("cider:window", (_event, action) => {
    if (!win) return false;
    switch (action) {
      case "minimize":
        win.minimize();
        return true;
      case "toggle-maximize":
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        return win.isMaximized();
      case "is-maximized":
        return win.isMaximized();
      case "close":
        win.close();
        return true;
      default:
        return false;
    }
  });

  ipcMain.handle("cider:open-external", (_event, url) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) {
      return shell.openExternal(url);
    }
  });

  ipcMain.handle("cider:discord-activity", (_event, payload) => {
    if (payload && typeof payload === "object") discord.setActivity(payload);
  });

  ipcMain.handle("cider:discord-clear", () => discord.clearActivity());

  ipcMain.handle("cider:widevine-status", () => {
    try {
      return { status: components?.status?.() ?? {}, updatesEnabled: components?.updatesEnabled };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle("cider:widevine-retry", () => {
    installWidevine();
    return true;
  });

  ipcMain.handle("cider:set-media-keys", (_event, enabled) => {
    globalShortcut.unregisterAll();
    if (!enabled) return true;
    const bindings = {
      MediaPlayPause: "play-pause",
      MediaNextTrack: "next",
      MediaPreviousTrack: "previous",
    };
    for (const [accelerator, action] of Object.entries(bindings)) {
      try {
        globalShortcut.register(accelerator, () => {
          win?.webContents.send("cider:media-key", action);
        });
      } catch {
        /* another app may own the key */
      }
    }
    return true;
  });
}

app.whenReady().then(async () => {
  spoofAppleHeaders();
  registerIpc();
  createWindow();

  // castLabs Widevine installs in the background and persists across
  // launches — don't block the UI on it.
  installWidevine();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * Install/verify the castLabs Widevine CDM, logging the real reason on
 * failure (the nested ComponentError.detail carries the actual status).
 */
function installWidevine() {
  if (!components?.whenReady) {
    console.warn("[cider] Not a castLabs build — no Widevine, previews only.");
    return;
  }

  // A previous run may have persisted component updates as disabled, which
  // would make the CDM never install. Force them on.
  try {
    if (components.updatesEnabled === false) {
      components.updatesEnabled = true;
      console.log("[cider] Re-enabled component updates.");
    }
  } catch {
    /* property may be read-only on some builds */
  }

  components
    .whenReady()
    .then(() => {
      const status = components.status?.() ?? {};
      console.log("[cider] Widevine ready:", JSON.stringify(status));
      win?.webContents.send("cider:widevine-ready");
    })
    .catch((err) => {
      const details = (err?.errors ?? [err]).map((e) => ({
        message: e?.message,
        detail: e?.detail, // { id, status, title, version }
      }));
      console.warn(
        "[cider] Widevine CDM failed to install:\n" +
          JSON.stringify(details, null, 2) +
          "\n[cider] status(): " +
          JSON.stringify(components.status?.() ?? {}) +
          "\n[cider] Full playback needs this CDM. It downloads from Google's" +
          " component servers; if this persists, a DNS/VPN/proxy is likely" +
          " blocking it. Retry from Settings or relaunch."
      );
      win?.webContents.send("cider:widevine-failed", details);
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  discord.destroy();
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
});
