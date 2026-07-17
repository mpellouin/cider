/**
 * Discord Rich Presence for the Electron shell.
 * Uses discord-auto-rpc (same library as legacy Cider) which reconnects
 * endlessly in the background until Discord shows up.
 */

const DISCORD_APP_ID = "911790844204437504";

let client = null;
let connected = false;
let pendingActivity = null;

function ensureClient() {
  if (client) return;
  const { AutoClient } = require("discord-auto-rpc");
  client = new AutoClient({ transport: "ipc" });
  client.once("ready", () => {
    connected = true;
    if (pendingActivity) {
      client.setActivity(pendingActivity).catch(() => {});
      pendingActivity = null;
    }
  });
  client.endlessLogin({ clientId: DISCORD_APP_ID }).catch(() => {
    /* keeps retrying internally */
  });
}

function setActivity(payload) {
  ensureClient();
  const activity = {
    details: (payload.details || "Apple Music").slice(0, 128),
    state: (payload.state || " ").slice(0, 128) || " ",
    largeImageKey: payload.largeImage || "cider",
    largeImageText: (payload.largeText || "").slice(0, 128) || undefined,
    instance: false,
    type: 2, // "Listening to"
  };
  if (payload.startMs) activity.startTimestamp = Math.round(payload.startMs);
  if (payload.endMs) activity.endTimestamp = Math.round(payload.endMs);
  if (payload.songUrl) {
    activity.buttons = [{ label: "Listen on Apple Music", url: payload.songUrl }];
  }
  if (connected) {
    client.setActivity(activity).catch(() => {});
  } else {
    pendingActivity = activity;
  }
}

function clearActivity() {
  pendingActivity = null;
  if (client && connected) {
    client.clearActivity().catch(() => {});
  }
}

function destroy() {
  if (client) {
    try {
      client.destroy();
    } catch {
      /* already gone */
    }
    client = null;
    connected = false;
  }
}

module.exports = { setActivity, clearActivity, destroy };
