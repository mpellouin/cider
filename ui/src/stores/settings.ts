import { defineStore } from "pinia";

export interface CiderSettings {
  theme: "dark" | "light" | "auto";
  dynamicAccent: boolean;
  ambientGlow: boolean;
  discordRpc: boolean;
  discordShowButton: boolean;
  globalMediaKeys: boolean;
  lyricsBlur: boolean;
  reducedMotion: boolean;
  volume: number;
}

const STORAGE_KEY = "cider.settings.v2";

const defaults: CiderSettings = {
  theme: "dark",
  dynamicAccent: true,
  ambientGlow: true,
  discordRpc: true,
  discordShowButton: true,
  globalMediaKeys: true,
  lyricsBlur: true,
  reducedMotion: false,
  volume: 0.75,
};

function load(): CiderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export const useSettings = defineStore("settings", {
  state: (): CiderSettings => load(),
  actions: {
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
    },
    set<K extends keyof CiderSettings>(key: K, value: CiderSettings[K]) {
      // @ts-expect-error index write on typed state
      this[key] = value;
      this.persist();
      this.applySideEffects(key);
    },
    applySideEffects(key: keyof CiderSettings) {
      if (key === "theme") applyTheme(this.theme);
      if (key === "reducedMotion") {
        document.documentElement.classList.toggle("reduced-motion", this.reducedMotion);
      }
    },
    applyAll() {
      applyTheme(this.theme);
      document.documentElement.classList.toggle("reduced-motion", this.reducedMotion);
    },
  },
});

function applyTheme(theme: CiderSettings["theme"]) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const resolved = theme === "auto" ? (prefersLight ? "light" : "dark") : theme;
  root.dataset.theme = resolved;
}
