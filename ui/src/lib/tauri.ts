/**
 * Desktop bridge. The UI runs in three environments:
 *  - Tauri (Rust backend, commands via invoke)
 *  - Electron shell (castLabs/Widevine, bridge via window.cider preload)
 *  - plain browser (frontend dev — everything degrades gracefully)
 */

export const isTauri: boolean =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isElectron: boolean =
  typeof window !== "undefined" && Boolean(window.cider);

/** Any desktop shell with native integrations (Discord, media keys…). */
export const isDesktop: boolean = isTauri || isElectron;

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }

  if (isElectron) {
    const bridge = window.cider!;
    switch (command) {
      case "fetch_developer_token":
        return bridge.fetchDeveloperToken(Boolean(args?.forceRefresh)) as Promise<T>;
      case "discord_set_activity":
        return bridge.discordSetActivity(
          (args?.payload as Record<string, unknown>) ?? {}
        ) as Promise<T>;
      case "discord_clear_activity":
        return bridge.discordClearActivity() as Promise<T>;
      default:
        throw new Error(`Command "${command}" is not available in the Electron shell`);
    }
  }

  throw new Error(`Desktop command "${command}" unavailable in the browser`);
}

export async function listen<T = unknown>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const un = await listen<T>(event, (e) => handler(e.payload));
  return un;
}

export async function openExternal(url: string): Promise<void> {
  if (!/^https:\/\//.test(url)) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else if (isElectron) {
    await window.cider!.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Window chrome helpers for the custom titlebar. */
export const appWindow = {
  async minimize() {
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    } else if (isElectron) {
      await window.cider!.windowControl("minimize");
    }
  },
  async toggleMaximize() {
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
    } else if (isElectron) {
      await window.cider!.windowControl("toggle-maximize");
    }
  },
  async close() {
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } else if (isElectron) {
      await window.cider!.windowControl("close");
    }
  },
  async isMaximized(): Promise<boolean> {
    if (isTauri) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return getCurrentWindow().isMaximized();
    }
    if (isElectron) {
      return window.cider!.windowControl("is-maximized");
    }
    return false;
  },
};
