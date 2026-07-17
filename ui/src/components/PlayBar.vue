<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import { usePlayer } from "@/stores/player";
import { formatDuration } from "@/lib/time";

const player = usePlayer();

const scrubbing = ref(false);
const scrubValue = ref(0);

const displayTime = computed(() =>
  scrubbing.value ? scrubValue.value : player.currentTime
);

function onScrubInput(e: Event) {
  scrubbing.value = true;
  scrubValue.value = Number((e.target as HTMLInputElement).value);
}

function onScrubCommit(e: Event) {
  const value = Number((e.target as HTMLInputElement).value);
  scrubbing.value = false;
  void player.seekTo(value);
}

const volumeIcon = computed(() => {
  if (player.volume <= 0.001) return "volume-mute";
  if (player.volume < 0.5) return "volume-low";
  return "volume-high";
});

const repeatTitle = computed(
  () => ["Repeat: off", "Repeat: one", "Repeat: all"][player.repeatMode] ?? "Repeat"
);
</script>

<template>
  <footer class="playbar">
    <div class="pb-progress">
      <input
        class="scrub"
        type="range"
        min="0"
        :max="player.duration || 1"
        step="0.25"
        :value="displayTime"
        :style="{ '--fill': `${(displayTime / (player.duration || 1)) * 100}%` }"
        @input="onScrubInput"
        @change="onScrubCommit"
      />
    </div>

    <div class="pb-body">
      <!-- current track -->
      <div class="pb-track">
        <button
          v-if="player.nowPlaying"
          class="pb-art-btn"
          title="Now Playing"
          @click="player.showNowPlaying = true"
        >
          <img :src="player.nowPlaying.artworkSmall" alt="" class="pb-art" />
          <span class="pb-art-expand"><Icon name="expand" :size="15" /></span>
        </button>
        <div v-else class="pb-art placeholder"><Icon name="music" :size="18" /></div>

        <div v-if="player.nowPlaying" class="pb-meta">
          <div class="pb-title" :title="player.nowPlaying.title">{{ player.nowPlaying.title }}</div>
          <div class="pb-artist" :title="player.nowPlaying.artist">
            {{ player.nowPlaying.artist }}
          </div>
        </div>
        <div v-else class="pb-meta">
          <div class="pb-title muted">Not playing</div>
        </div>

        <button
          v-if="player.nowPlaying"
          class="icon-btn"
          :class="{ active: player.loved }"
          title="Love"
          @click="player.toggleLove()"
        >
          <Icon name="heart" :size="16" />
        </button>
      </div>

      <!-- transport -->
      <div class="pb-transport">
        <button
          class="icon-btn"
          :class="{ active: player.shuffleMode === 1 }"
          title="Shuffle"
          @click="player.toggleShuffle()"
        >
          <Icon name="shuffle" :size="16" />
        </button>
        <button class="icon-btn big" title="Previous" @click="player.previous()">
          <Icon name="prev" :size="20" />
        </button>
        <button class="play-btn" :title="player.isPlaying ? 'Pause' : 'Play'" @click="player.togglePlay()">
          <span v-if="player.isBuffering" class="spinner"></span>
          <Icon v-else :name="player.isPlaying ? 'pause' : 'play'" :size="20" />
        </button>
        <button class="icon-btn big" title="Next" @click="player.next()">
          <Icon name="next" :size="20" />
        </button>
        <button
          class="icon-btn"
          :class="{ active: player.repeatMode !== 0 }"
          :title="repeatTitle"
          @click="player.cycleRepeat()"
        >
          <Icon name="repeat" :size="16" />
          <span v-if="player.repeatMode === 1" class="repeat-one">1</span>
        </button>
      </div>

      <!-- right cluster -->
      <div class="pb-right">
        <span class="pb-time">
          {{ formatDuration(displayTime) }} / {{ formatDuration(player.duration) }}
        </span>
        <button
          class="icon-btn"
          :class="{ active: player.showNowPlaying }"
          title="Lyrics & Now Playing"
          @click="player.showNowPlaying = !player.showNowPlaying"
        >
          <Icon name="lyrics" :size="17" />
        </button>
        <button
          class="icon-btn"
          :class="{ active: player.showQueue }"
          title="Queue"
          @click="player.showQueue = !player.showQueue"
        >
          <Icon name="queue" :size="17" />
        </button>
        <div class="volume">
          <Icon :name="volumeIcon" :size="16" />
          <input
            class="vol-slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="player.volume"
            :style="{ '--fill': `${player.volume * 100}%` }"
            @input="player.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.playbar {
  height: var(--playbar-height);
  position: relative;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  backdrop-filter: blur(40px) saturate(1.6);
  z-index: 25;
}

.pb-progress {
  position: absolute;
  top: -7px;
  left: 0;
  right: 0;
  height: 14px;
  display: flex;
  align-items: center;
}

/* range styling shared by scrub + volume */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 4px;
  background:
    linear-gradient(var(--accent), var(--accent)) 0 / var(--fill, 0%) 100% no-repeat,
    var(--surface-active);
  outline: none;
  cursor: pointer;
  transition: height 0.15s ease;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
input[type="range"]:hover {
  height: 6px;
}
input[type="range"]:hover::-webkit-slider-thumb {
  opacity: 1;
}

.pb-body {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr);
  align-items: center;
  padding: 0 18px;
  gap: 16px;
}

.pb-track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.pb-art-btn {
  position: relative;
  border-radius: 9px;
  overflow: hidden;
  flex-shrink: 0;
  transition: transform 0.2s var(--ease-spring);
}
.pb-art-btn:hover {
  transform: scale(1.04);
}
.pb-art {
  width: 52px;
  height: 52px;
  border-radius: 9px;
  object-fit: cover;
  display: block;
}
.pb-art.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-tertiary);
}
.pb-art-expand {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: white;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.pb-art-btn:hover .pb-art-expand {
  opacity: 1;
}

.pb-meta {
  min-width: 0;
}
.pb-title {
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb-transport {
  display: flex;
  align-items: center;
  gap: 6px;
}
.icon-btn.big {
  width: 40px;
  height: 40px;
}
.play-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--text);
  color: var(--bg);
  margin: 0 4px;
  transition: transform 0.15s var(--ease-spring), filter 0.15s ease;
}
.play-btn:hover {
  transform: scale(1.06);
}
.play-btn:active {
  transform: scale(0.94);
}

.repeat-one {
  position: absolute;
  font-size: 8px;
  font-weight: 800;
  margin-top: -14px;
  margin-left: 14px;
  color: var(--accent);
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.25);
  border-top-color: currentColor;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.pb-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.pb-time {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  margin-right: 4px;
}
.volume {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  width: 120px;
}
.vol-slider {
  flex: 1;
}
</style>
