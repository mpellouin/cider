<script setup lang="ts">
import Icon from "./Icon.vue";
import { usePlayer } from "@/stores/player";
import { formatMillis } from "@/lib/time";

const player = usePlayer();
</script>

<template>
  <Transition name="slide-panel">
    <aside v-if="player.showQueue" class="queue-panel">
      <div class="q-head">
        <h3>Playing Next</h3>
        <button class="icon-btn" title="Close" @click="player.showQueue = false">
          <Icon name="close" :size="16" />
        </button>
      </div>

      <div v-if="player.queue.length === 0" class="q-empty">
        <Icon name="queue" :size="28" />
        <p>Nothing queued yet.</p>
      </div>

      <div v-else class="q-list">
        <button
          v-for="entry in player.queue"
          :key="entry.id"
          class="q-row"
          :class="{
            current: entry.index === player.queuePosition,
            past: entry.index < player.queuePosition,
          }"
          @click="player.jumpToQueueIndex(entry.index)"
        >
          <img v-if="entry.artworkUrl" :src="entry.artworkUrl" alt="" class="q-art" />
          <div v-else class="q-art q-art-fallback"><Icon name="music" :size="14" /></div>
          <div class="q-meta">
            <div class="q-title">{{ entry.title }}</div>
            <div class="q-artist">{{ entry.artist }}</div>
          </div>
          <span class="q-duration">{{ formatMillis(entry.durationMs) }}</span>
        </button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.queue-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 82%, transparent);
  backdrop-filter: blur(36px) saturate(1.5);
}

.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 10px;
}
.q-head h3 {
  font-size: 15px;
  font-weight: 700;
}

.q-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
}

.q-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.q-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 9px;
  text-align: left;
  transition: background 0.12s ease, opacity 0.2s ease;
}
.q-row:hover {
  background: var(--surface-hover);
}
.q-row.current {
  background: rgba(var(--accent-rgb), 0.13);
}
.q-row.current .q-title {
  color: var(--accent);
}
.q-row.past {
  opacity: 0.45;
}

.q-art {
  width: 38px;
  height: 38px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
}
.q-art-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-tertiary);
}

.q-meta {
  flex: 1;
  min-width: 0;
}
.q-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-artist {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-duration {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
</style>
