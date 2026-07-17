<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import Icon from "./Icon.vue";
import { usePlayer } from "@/stores/player";
import { useSettings } from "@/stores/settings";
import { formatDuration } from "@/lib/time";

const player = usePlayer();
const settings = useSettings();

const lyricsEl = ref<HTMLElement | null>(null);
const userScrolling = ref(false);
let scrollIdleTimer = 0;

const np = computed(() => player.nowPlaying);

watch(
  () => player.activeLyricLine,
  async (idx) => {
    if (idx < 0 || userScrolling.value) return;
    await nextTick();
    const container = lyricsEl.value;
    const line = container?.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    if (container && line) {
      container.scrollTo({
        top: line.offsetTop - container.clientHeight * 0.38,
        behavior: "smooth",
      });
    }
  }
);

function onLyricsScroll() {
  userScrolling.value = true;
  window.clearTimeout(scrollIdleTimer);
  scrollIdleTimer = window.setTimeout(() => (userScrolling.value = false), 2500);
}

function seekToLine(begin: number) {
  if (begin >= 0) void player.seekTo(begin);
}

function onScrub(e: Event) {
  void player.seekTo(Number((e.target as HTMLInputElement).value));
}

function close() {
  player.showNowPlaying = false;
}
</script>

<template>
  <Transition name="overlay">
    <div v-if="player.showNowPlaying && np" class="now-playing">
      <!-- ambient animated backdrop -->
      <div class="ambient" :class="{ still: !settings.ambientGlow }">
        <img :src="np.artworkLarge" alt="" class="ambient-img one" />
        <img :src="np.artworkLarge" alt="" class="ambient-img two" />
        <div class="ambient-dim"></div>
      </div>

      <button class="icon-btn close-btn" title="Close" @click="close">
        <Icon name="chevron-down" :size="22" />
      </button>

      <div class="np-layout" :class="{ 'with-lyrics': player.lyrics }">
        <!-- left: artwork + controls -->
        <div class="np-main">
          <img
            :src="np.artworkLarge"
            alt=""
            class="np-art"
            :class="{ paused: !player.isPlaying }"
          />
          <div class="np-meta">
            <div class="np-title">{{ np.title }}</div>
            <div class="np-artist">{{ np.artist }}<template v-if="np.album"> — {{ np.album }}</template></div>
          </div>

          <div class="np-progress">
            <input
              type="range"
              min="0"
              :max="player.duration || 1"
              step="0.25"
              :value="player.currentTime"
              :style="{ '--fill': `${player.progress * 100}%` }"
              @change="onScrub"
            />
            <div class="np-times">
              <span>{{ formatDuration(player.currentTime) }}</span>
              <span>-{{ formatDuration(Math.max(0, player.duration - player.currentTime)) }}</span>
            </div>
          </div>

          <div class="np-controls">
            <button
              class="icon-btn"
              :class="{ active: player.shuffleMode === 1 }"
              @click="player.toggleShuffle()"
            >
              <Icon name="shuffle" :size="18" />
            </button>
            <button class="icon-btn xl" @click="player.previous()">
              <Icon name="prev" :size="26" />
            </button>
            <button class="np-play" @click="player.togglePlay()">
              <Icon :name="player.isPlaying ? 'pause' : 'play'" :size="26" />
            </button>
            <button class="icon-btn xl" @click="player.next()">
              <Icon name="next" :size="26" />
            </button>
            <button
              class="icon-btn"
              :class="{ active: player.repeatMode !== 0 }"
              @click="player.cycleRepeat()"
            >
              <Icon name="repeat" :size="18" />
            </button>
          </div>

          <div class="np-secondary">
            <button
              class="icon-btn"
              :class="{ active: player.loved }"
              title="Love"
              @click="player.toggleLove()"
            >
              <Icon name="heart" :size="18" />
            </button>
            <div class="np-volume">
              <Icon name="volume-low" :size="15" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="player.volume"
                :style="{ '--fill': `${player.volume * 100}%` }"
                @input="player.setVolume(Number(($event.target as HTMLInputElement).value))"
              />
              <Icon name="volume-high" :size="15" />
            </div>
            <button
              class="icon-btn"
              :class="{ active: player.showQueue }"
              title="Queue"
              @click="player.showQueue = !player.showQueue"
            >
              <Icon name="queue" :size="18" />
            </button>
          </div>
        </div>

        <!-- right: synced lyrics -->
        <div v-if="player.lyricsLoading || player.lyrics" class="np-lyrics">
          <div v-if="player.lyricsLoading" class="lyrics-loading">
            <span class="spinner"></span>
          </div>
          <div
            v-else-if="player.lyrics"
            ref="lyricsEl"
            class="lyrics-scroll"
            :class="{ blur: settings.lyricsBlur && player.lyrics.synced }"
            @scroll="onLyricsScroll"
          >
            <div class="lyrics-spacer"></div>
            <p
              v-for="(line, i) in player.lyrics.lines"
              :key="i"
              :data-line="i"
              class="lyric-line"
              :class="{
                active: i === player.activeLyricLine,
                past: player.lyrics.synced && i < player.activeLyricLine,
                unsynced: !player.lyrics.synced,
              }"
              @click="seekToLine(line.begin)"
            >
              {{ line.text }}
            </p>
            <div class="lyrics-spacer"></div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.now-playing {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ambient artwork backdrop */
.ambient {
  position: absolute;
  inset: -20%;
  filter: blur(90px) saturate(1.7) brightness(0.55);
  z-index: 0;
}
.ambient-img {
  position: absolute;
  width: 70%;
  aspect-ratio: 1;
  border-radius: 40%;
  object-fit: cover;
}
.ambient-img.one {
  top: -5%;
  left: -5%;
  animation: drift-a 34s linear infinite;
}
.ambient-img.two {
  bottom: -5%;
  right: -5%;
  animation: drift-b 41s linear infinite;
}
.ambient.still .ambient-img {
  animation: none;
}
.ambient-dim {
  position: absolute;
  inset: 0;
  background: rgba(8, 8, 12, 0.35);
}
:root[data-theme="light"] .ambient-dim {
  background: rgba(255, 255, 255, 0.25);
}
@keyframes drift-a {
  0% { transform: rotate(0deg) translateX(4%) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(4%) rotate(-360deg); }
}
@keyframes drift-b {
  0% { transform: rotate(360deg) translateX(6%) rotate(-360deg); }
  100% { transform: rotate(0deg) translateX(6%) rotate(0deg); }
}

.close-btn {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 2;
  color: white;
}

.np-layout {
  position: relative;
  z-index: 1;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
  justify-items: center;
  padding: 40px 6vw;
  gap: 5vw;
  color: white;
}
.np-layout.with-lyrics {
  grid-template-columns: minmax(340px, 44%) 1fr;
}

.np-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 460px;
}

.np-art {
  width: min(38vh, 100%);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 20px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  transition: transform 0.5s var(--ease-spring), box-shadow 0.5s ease;
}
.np-art.paused {
  transform: scale(0.86);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.4);
}

.np-meta {
  text-align: center;
  margin-top: 26px;
  max-width: 100%;
}
.np-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.np-artist {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 4px;
}

.np-progress {
  width: 100%;
  margin-top: 26px;
}
.np-times {
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 5px;
  background:
    linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0.95)) 0 / var(--fill, 0%) 100% no-repeat,
    rgba(255, 255, 255, 0.22);
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  opacity: 0;
  transition: opacity 0.15s ease;
}
input[type="range"]:hover::-webkit-slider-thumb {
  opacity: 1;
}

.np-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}
.np-controls .icon-btn,
.np-secondary .icon-btn {
  color: rgba(255, 255, 255, 0.75);
}
.np-controls .icon-btn:hover,
.np-secondary .icon-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.12);
}
.np-controls .icon-btn.active,
.np-secondary .icon-btn.active {
  color: var(--accent);
}
.icon-btn.xl {
  width: 48px;
  height: 48px;
}
.np-play {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  color: #111;
  transition: transform 0.18s var(--ease-spring);
}
.np-play:hover { transform: scale(1.07); }
.np-play:active { transform: scale(0.93); }

.np-secondary {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-top: 22px;
  width: 100%;
  justify-content: center;
}
.np-volume {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.6);
  width: 200px;
}

/* lyrics pane */
.np-lyrics {
  width: 100%;
  height: 72vh;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lyrics-loading {
  color: white;
}
.spinner {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.25);
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.lyrics-scroll {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(transparent, black 12%, black 88%, transparent);
  -webkit-mask-image: linear-gradient(transparent, black 12%, black 88%, transparent);
}
.lyrics-scroll::-webkit-scrollbar {
  display: none;
}
.lyrics-spacer {
  height: 34vh;
}

.lyric-line {
  font-size: clamp(20px, 2.4vw, 32px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.25;
  padding: 10px 6px;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  transition: color 0.3s ease, transform 0.3s var(--ease-spring), filter 0.3s ease, opacity 0.3s ease;
  transform-origin: left center;
}
.lyrics-scroll.blur .lyric-line:not(.active) {
  filter: blur(1.5px);
}
.lyrics-scroll.blur:hover .lyric-line {
  filter: none;
}
.lyric-line:hover {
  color: rgba(255, 255, 255, 0.75);
}
.lyric-line.active {
  color: white;
  transform: scale(1.03);
  text-shadow: 0 0 30px rgba(var(--accent-rgb), 0.5);
}
.lyric-line.past {
  opacity: 0.5;
}
.lyric-line.unsynced {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  cursor: default;
  padding: 6px;
}

@media (max-width: 980px) {
  .np-layout.with-lyrics {
    grid-template-columns: 1fr;
  }
  .np-lyrics {
    display: none;
  }
}
</style>
