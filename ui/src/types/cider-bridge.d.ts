/** The `window.cider` bridge exposed by the Electron shell's preload. */

interface CiderElectronBridge {
  shell: "electron";
  fetchDeveloperToken(forceRefresh?: boolean): Promise<{
    token: string;
    expires_at: number;
    origin: string;
  }>;
  windowControl(action: "minimize" | "toggle-maximize" | "is-maximized" | "close"): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  discordSetActivity(payload: Record<string, unknown>): Promise<void>;
  discordClearActivity(): Promise<void>;
  setMediaKeys(enabled: boolean): Promise<boolean>;
  onMediaKey(callback: (action: "play-pause" | "next" | "previous") => void): () => void;
}

interface Window {
  cider?: CiderElectronBridge;
}
