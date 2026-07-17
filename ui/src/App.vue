<script setup lang="ts">
import { onMounted, ref } from "vue";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";
import PlayBar from "@/components/PlayBar.vue";
import NowPlaying from "@/components/NowPlaying.vue";
import QueuePanel from "@/components/QueuePanel.vue";
import CommandPalette from "@/components/CommandPalette.vue";
import Icon from "@/components/Icon.vue";
import { bootstrapMusicKit, type BootstrapProgress } from "@/lib/musickit";
import { startPresenceSync } from "@/lib/presence";
import { startMediaKeys } from "@/lib/mediakeys";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";

const player = usePlayer();
const settings = useSettings();

const bootStep = ref<BootstrapProgress["step"]>("token");
const bootDetail = ref("");
const manualToken = ref("");

function saveManualToken() {
  const token = manualToken.value.trim();
  if (!token || token.split(".").length !== 3) return;
  localStorage.setItem("cider.manualToken", token);
  manualToken.value = "";
  void boot();
}

const bootMessages: Record<string, string> = {
  token: "Contacting Apple Music…",
  script: "Loading MusicKit…",
  configure: "Tuning the player…",
  ready: "Ready",
  error: "Something went wrong",
};

async function boot() {
  bootStep.value = "token";
  bootDetail.value = "";
  try {
    await bootstrapMusicKit((p) => {
      bootStep.value = p.step;
      if (p.detail) bootDetail.value = p.detail;
    });
    player.attach();
    startPresenceSync();
    startMediaKeys();
  } catch (err) {
    bootStep.value = "error";
    if (!bootDetail.value) bootDetail.value = String(err);
  }
}

onMounted(() => {
  settings.applyAll();
  void boot();

  window.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    const typing = ["INPUT", "TEXTAREA"].includes(target?.tagName) || target?.isContentEditable;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      player.showPalette = !player.showPalette;
      return;
    }
    if (typing) return;

    if (e.code === "Space") {
      e.preventDefault();
      void player.togglePlay();
    } else if (e.key === "ArrowRight" && (e.metaKey || e.ctrlKey)) {
      void player.next();
    } else if (e.key === "ArrowLeft" && (e.metaKey || e.ctrlKey)) {
      void player.previous();
    } else if (e.key === "Escape") {
      if (player.showNowPlaying) player.showNowPlaying = false;
      else if (player.showQueue) player.showQueue = false;
    } else if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey) {
      player.showNowPlaying = !player.showNowPlaying;
    }
  });
});
</script>

<template>
  <!-- boot screen -->
  <div v-if="!player.ready" class="boot">
    <img src="/cider-icon.png" alt="Cider" class="boot-icon" :class="{ pulse: bootStep !== 'error' }" />
    <div class="boot-status">
      <template v-if="bootStep !== 'error'">
        <span class="spinner"></span>
        {{ bootMessages[bootStep] }}
      </template>
      <template v-else>
        <p class="boot-error-title">{{ bootMessages.error }}</p>
        <p class="boot-error-detail">{{ bootDetail }}</p>
        <button class="pill-btn" @click="boot">Try again</button>
        <div class="manual-token">
          <p class="manual-token-hint">
            Stuck? Paste an Apple Music developer token (JWT starting with
            <code>eyJh…</code>) and Cider will use it instead:
          </p>
          <div class="manual-token-row">
            <input
              v-model="manualToken"
              class="manual-token-input"
              placeholder="eyJhbGciOiJFUzI1NiIs…"
              spellcheck="false"
              @keydown.enter="saveManualToken"
            />
            <button class="pill-btn ghost" @click="saveManualToken">Use token</button>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- app shell -->
  <div v-else class="shell">
    <div class="shell-body">
      <Sidebar />
      <div class="content">
        <TitleBar />

        <div v-if="!player.authorized" class="auth-banner fade-up">
          <Icon name="apple" :size="16" />
          <span>Sign in with your Apple ID to unlock your library and full playback.</span>
          <button class="pill-btn" @click="player.authorize()">Sign in</button>
        </div>
        <div v-else-if="player.drm === 'preview-only'" class="drm-banner">
          <Icon name="sparkles" :size="14" />
          <span>This platform's webview has no DRM module — playing 30s previews.</span>
        </div>

        <main class="page-scroll">
          <RouterView v-slot="{ Component }">
            <Transition name="route-fade" mode="out-in">
              <component :is="Component" />
            </Transition>
          </RouterView>
        </main>

        <QueuePanel />
      </div>
    </div>
    <PlayBar />
    <NowPlaying />
    <CommandPalette />
  </div>
</template>

<style scoped>
.boot {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  background: radial-gradient(80% 90% at 50% 10%, rgba(var(--accent-rgb), 0.14), transparent 60%), var(--bg);
}
.boot-icon {
  width: 92px;
  height: 92px;
  border-radius: 22px;
  box-shadow: 0 20px 60px rgba(var(--accent-rgb), 0.3);
}
.boot-icon.pulse {
  animation: boot-pulse 2s ease-in-out infinite;
}
@keyframes boot-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.boot-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}
.boot-status .spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--surface-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.boot-error-title {
  font-weight: 700;
  color: var(--text);
}
.boot-error-detail {
  max-width: 440px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-tertiary);
  user-select: text;
}

.manual-token {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 520px;
}
.manual-token-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}
.manual-token-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.manual-token-input {
  flex: 1;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  outline: none;
  font-size: 12.5px;
  color: var(--text);
}
.manual-token-input:focus {
  border-color: rgba(var(--accent-rgb), 0.5);
}

.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.shell-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background:
    radial-gradient(90% 60% at 80% -10%, rgba(var(--accent-rgb), 0.07), transparent 60%),
    var(--bg);
}
.page-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.auth-banner,
.drm-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 32px 4px;
  padding: 12px 18px;
  border-radius: var(--radius-m);
  background: rgba(var(--accent-rgb), 0.1);
  border: 1px solid rgba(var(--accent-rgb), 0.25);
  font-size: 13px;
}
.auth-banner span {
  flex: 1;
}
.auth-banner .pill-btn {
  padding: 6px 16px;
}
.drm-banner {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 8px 16px;
}
</style>
