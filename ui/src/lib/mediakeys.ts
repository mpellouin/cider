/**
 * Media-key handling:
 *  - MediaSession API inside the webview (album art on the OS media flyout).
 *  - Optional global shortcuts via the Tauri global-shortcut plugin so the
 *    keys work while Cider is in the background.
 */

import { watch } from "vue";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { isElectron, isTauri } from "./tauri";

export function startMediaKeys(): void {
  const player = usePlayer();
  const settings = useSettings();

  /* MediaSession metadata (works everywhere, no permissions needed) */
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => void player.togglePlay());
    ms.setActionHandler("pause", () => void player.togglePlay());
    ms.setActionHandler("nexttrack", () => void player.next());
    ms.setActionHandler("previoustrack", () => void player.previous());
    ms.setActionHandler("seekto", (e) => {
      if (e.seekTime != null) void player.seekTo(e.seekTime);
    });

    watch(
      () => player.nowPlaying,
      (np) => {
        if (!np) {
          ms.metadata = null;
          return;
        }
        ms.metadata = new MediaMetadata({
          title: np.title,
          artist: np.artist,
          album: np.album,
          artwork: np.artworkLarge
            ? [{ src: np.artworkLarge, sizes: "1000x1000", type: "image/webp" }]
            : [],
        });
      },
      { immediate: true }
    );

    watch(
      () => player.isPlaying,
      (playing) => {
        ms.playbackState = playing ? "playing" : "paused";
      }
    );
  }

  /* Global media keys (background control) */
  if (isElectron) {
    window.cider!.onMediaKey((action) => {
      if (action === "play-pause") void player.togglePlay();
      else if (action === "next") void player.next();
      else if (action === "previous") void player.previous();
    });
    watch(
      () => settings.globalMediaKeys,
      (enabled) => void window.cider!.setMediaKeys(enabled).catch(() => {}),
      { immediate: true }
    );
  } else if (isTauri) {
    const applyGlobal = async (enable: boolean) => {
      try {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        const bindings: Array<[string, () => void]> = [
          ["MediaPlayPause", () => void player.togglePlay()],
          ["MediaTrackNext", () => void player.next()],
          ["MediaTrackPrevious", () => void player.previous()],
        ];
        for (const [key, handler] of bindings) {
          const registered = await gs.isRegistered(key);
          if (enable && !registered) {
            await gs.register(key, (event) => {
              if (event.state === "Pressed") handler();
            });
          } else if (!enable && registered) {
            await gs.unregister(key);
          }
        }
      } catch (err) {
        console.warn("[cider] global media keys unavailable:", err);
      }
    };

    watch(
      () => settings.globalMediaKeys,
      (enabled) => void applyGlobal(enabled),
      { immediate: true }
    );
  }
}
