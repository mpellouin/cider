/**
 * Preload — exposes the minimal `window.cider` bridge the Vue UI uses.
 * Mirrors the Tauri command surface (see ui/src/lib/tauri.ts).
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cider", {
  shell: "electron",

  fetchDeveloperToken: (forceRefresh) => ipcRenderer.invoke("cider:get-token", forceRefresh),

  windowControl: (action) => ipcRenderer.invoke("cider:window", action),

  openExternal: (url) => ipcRenderer.invoke("cider:open-external", url),

  discordSetActivity: (payload) => ipcRenderer.invoke("cider:discord-activity", payload),
  discordClearActivity: () => ipcRenderer.invoke("cider:discord-clear"),

  widevineStatus: () => ipcRenderer.invoke("cider:widevine-status"),
  widevineRetry: () => ipcRenderer.invoke("cider:widevine-retry"),

  setMediaKeys: (enabled) => ipcRenderer.invoke("cider:set-media-keys", enabled),
  onMediaKey: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("cider:media-key", listener);
    return () => ipcRenderer.removeListener("cider:media-key", listener);
  },
});
