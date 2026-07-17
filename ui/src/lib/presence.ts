/**
 * Discord Rich Presence sync — watches the player store and forwards
 * "Listening to …" activity to the Rust side.
 */

import { watch } from "vue";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { invoke, isTauri } from "./tauri";

let started = false;

export function startPresenceSync(): void {
  if (started || !isTauri) return;
  started = true;

  const player = usePlayer();
  const settings = useSettings();

  let lastKey = "";

  const push = async () => {
    if (!settings.discordRpc) return;
    const np = player.nowPlaying;
    if (!np || !player.isPlaying) {
      if (lastKey !== "") {
        lastKey = "";
        await invoke("discord_clear_activity").catch(() => {});
      }
      return;
    }

    const key = `${np.id}:${Math.round(player.currentTime / 15)}`;
    if (key === lastKey) return;
    lastKey = key;

    const now = Date.now();
    const startMs = now - Math.round(player.currentTime * 1000);
    const endMs = startMs + np.durationMs;

    await invoke("discord_set_activity", {
      payload: {
        details: np.title,
        state: np.artist || "Apple Music",
        largeImage: np.artworkLarge || "cider",
        largeText: np.album || np.title,
        startMs,
        endMs: np.durationMs > 0 ? endMs : null,
        songUrl: settings.discordShowButton ? np.url ?? null : null,
      },
    }).catch(() => {
      /* Discord not running — retry on the next track change */
      lastKey = "";
    });
  };

  watch(
    () => [player.nowPlaying?.id, player.isPlaying, settings.discordRpc],
    () => void push(),
    { immediate: true }
  );

  // Re-sync timestamps after seeks.
  watch(
    () => Math.round(player.currentTime / 15),
    () => void push()
  );

  watch(
    () => settings.discordRpc,
    (enabled) => {
      if (!enabled) void invoke("discord_clear_activity").catch(() => {});
    }
  );
}
