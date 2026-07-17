<script setup lang="ts">
import Icon from "@/components/Icon.vue";
import { useSettings, type CiderSettings } from "@/stores/settings";
import { usePlayer } from "@/stores/player";
import { getDrmStatus } from "@/lib/musickit";
import { openExternal, isDesktop } from "@/lib/tauri";

const settings = useSettings();
const player = usePlayer();

interface Toggle {
  key: keyof CiderSettings;
  label: string;
  hint: string;
  tauriOnly?: boolean;
}

const appearanceToggles: Toggle[] = [
  { key: "dynamicAccent", label: "Dynamic accent color", hint: "Tint the interface with the current artwork's palette." },
  { key: "ambientGlow", label: "Ambient artwork glow", hint: "Animated blurred artwork behind the Now Playing view." },
  { key: "lyricsBlur", label: "Focused lyrics", hint: "Softly blur inactive lyric lines for a stage effect." },
  { key: "reducedMotion", label: "Reduce motion", hint: "Minimize animations across the app." },
];

const integrationToggles: Toggle[] = [
  { key: "discordRpc", label: "Discord Rich Presence", hint: "Show what you're listening to on Discord.", tauriOnly: true },
  { key: "discordShowButton", label: "\"Listen on Apple Music\" button", hint: "Add a song link button to your Discord status.", tauriOnly: true },
  { key: "globalMediaKeys", label: "Global media keys", hint: "Control playback even when Cider is in the background.", tauriOnly: true },
];

const themes: { value: CiderSettings["theme"]; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "auto", label: "Auto" },
];

const drm = getDrmStatus();
</script>

<template>
  <div class="page settings">
    <h1 class="page-heading">Settings</h1>

    <section class="group fade-up">
      <h2 class="group-title">Appearance</h2>

      <div class="row">
        <div class="row-text">
          <div class="row-label">Theme</div>
          <div class="row-hint">Cider follows your pick everywhere.</div>
        </div>
        <div class="seg">
          <button
            v-for="t in themes"
            :key="t.value"
            class="seg-btn"
            :class="{ active: settings.theme === t.value }"
            @click="settings.set('theme', t.value)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div v-for="t in appearanceToggles" :key="t.key" class="row">
        <div class="row-text">
          <div class="row-label">{{ t.label }}</div>
          <div class="row-hint">{{ t.hint }}</div>
        </div>
        <button
          class="switch"
          :class="{ on: settings[t.key] }"
          role="switch"
          :aria-checked="Boolean(settings[t.key])"
          @click="settings.set(t.key, !settings[t.key] as never)"
        >
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="group fade-up">
      <h2 class="group-title">Integrations</h2>
      <div v-for="t in integrationToggles" :key="t.key" class="row" :class="{ disabled: t.tauriOnly && !isDesktop }">
        <div class="row-text">
          <div class="row-label">{{ t.label }}</div>
          <div class="row-hint">{{ t.hint }}<template v-if="t.tauriOnly && !isDesktop"> (desktop app only)</template></div>
        </div>
        <button
          class="switch"
          :class="{ on: settings[t.key] }"
          role="switch"
          :aria-checked="Boolean(settings[t.key])"
          :disabled="t.tauriOnly && !isDesktop"
          @click="settings.set(t.key, !settings[t.key] as never)"
        >
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="group fade-up">
      <h2 class="group-title">Account</h2>
      <div class="row">
        <div class="row-text">
          <div class="row-label">Apple Music</div>
          <div class="row-hint">
            {{ player.authorized ? "Signed in — your library and full playback are available." : "Not signed in." }}
          </div>
        </div>
        <button v-if="!player.authorized" class="pill-btn" @click="player.authorize()">
          <Icon name="apple" :size="14" /> Sign in
        </button>
        <button v-else class="pill-btn ghost" @click="player.unauthorize()">Sign out</button>
      </div>

      <div class="row">
        <div class="row-text">
          <div class="row-label">Playback quality</div>
          <div class="row-hint">
            <template v-if="drm === 'full'">Full-quality DRM playback is available on this platform.</template>
            <template v-else-if="drm === 'preview-only'">
              No DRM module in this webview — Cider plays 30-second previews.
              For full playback on Linux, run the Electron (Widevine) shell:
              <code>pnpm run shell:start</code>.
            </template>
            <template v-else>DRM capability unknown.</template>
          </div>
        </div>
        <span class="chip" :class="drm">{{ drm === "full" ? "Full" : drm === "preview-only" ? "Previews" : "—" }}</span>
      </div>
    </section>

    <section class="group fade-up">
      <h2 class="group-title">About</h2>
      <div class="row">
        <div class="row-text">
          <div class="row-label">Cider 2.0</div>
          <div class="row-hint">A delightful Apple Music experience — Vue 3 UI on a Tauri or Electron-Widevine shell.</div>
        </div>
        <button class="pill-btn ghost" @click="openExternal('https://cider.sh')">
          <Icon name="external" :size="14" /> cider.sh
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings {
  max-width: 780px;
}

.group {
  margin-bottom: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  background: var(--surface);
  overflow: hidden;
}
.group-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  padding: 16px 20px 4px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 20px;
}
.row + .row {
  border-top: 1px solid var(--border);
}
.row.disabled {
  opacity: 0.5;
}

.row-label {
  font-weight: 600;
  font-size: 14px;
}
.row-hint {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-top: 2px;
  max-width: 520px;
}

.switch {
  width: 46px;
  height: 27px;
  border-radius: 999px;
  background: var(--surface-active);
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;
}
.switch.on {
  background: var(--accent);
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s var(--ease-spring);
}
.switch.on .knob {
  transform: translateX(19px);
}

.seg {
  display: flex;
  background: var(--surface-active);
  border-radius: 999px;
  padding: 3px;
}
.seg-btn {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}
.seg-btn.active {
  background: var(--accent);
  color: white;
}

.chip {
  font-size: 11.5px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--surface-active);
  color: var(--text-secondary);
}
.chip.full {
  background: rgba(48, 209, 88, 0.18);
  color: #30d158;
}
.chip.preview-only {
  background: rgba(255, 159, 10, 0.18);
  color: #ff9f0a;
}
</style>
