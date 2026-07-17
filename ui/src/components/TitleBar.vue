<script setup lang="ts">
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { appWindow, isDesktop } from "@/lib/tauri";
import { usePlayer } from "@/stores/player";

const router = useRouter();
const player = usePlayer();

function openPalette() {
  player.showPalette = true;
}
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left" data-tauri-drag-region>
      <div class="nav-arrows">
        <button class="icon-btn" title="Back" @click="router.back()">
          <Icon name="chevron-left" />
        </button>
        <button class="icon-btn" title="Forward" @click="router.forward()">
          <Icon name="chevron-right" />
        </button>
      </div>
    </div>

    <button class="search-trigger" @click="openPalette">
      <Icon name="search" :size="14" />
      <span>Search Apple Music</span>
      <kbd>⌘K</kbd>
    </button>

    <div class="titlebar-right" data-tauri-drag-region>
      <div v-if="isDesktop" class="window-controls">
        <button class="wc" title="Minimize" @click="appWindow.minimize()">
          <Icon name="minimize" :size="14" />
        </button>
        <button class="wc" title="Maximize" @click="appWindow.toggleMaximize()">
          <Icon name="maximize" :size="13" />
        </button>
        <button class="wc wc-close" title="Close" @click="appWindow.close()">
          <Icon name="close" :size="14" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 10px;
  gap: 12px;
  position: relative;
  z-index: 30;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-arrows {
  display: flex;
  gap: 2px;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 340px;
  max-width: 38vw;
  height: 30px;
  padding: 0 12px;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-tertiary);
  font-size: 12.5px;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.search-trigger:hover {
  background: var(--surface-hover);
  border-color: rgba(var(--accent-rgb), 0.4);
}
.search-trigger span {
  flex: 1;
  text-align: left;
}
.search-trigger kbd {
  font-family: inherit;
  font-size: 10.5px;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.titlebar-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.window-controls {
  display: flex;
  gap: 2px;
}
.wc {
  width: 40px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--text-secondary);
  transition: background 0.12s ease, color 0.12s ease;
}
.wc:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.wc-close:hover {
  background: #e81123;
  color: white;
}
</style>
