<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { artworkUrl } from "@/lib/artwork";
import { usePlayer } from "@/stores/player";
import { routeForResource } from "@/router";

const props = defineProps<{
  item: MusicKit.MediaItem;
  /** round artwork for artists / stations that want it */
  round?: boolean;
  size?: "s" | "m" | "l";
}>();

const router = useRouter();
const player = usePlayer();

const title = computed(() => props.item.attributes?.name ?? "");
const subtitle = computed(
  () =>
    props.item.attributes?.artistName ??
    props.item.attributes?.curatorName ??
    (props.item.type?.includes("station") ? "Station" : "")
);
const art = computed(() => artworkUrl(props.item.attributes?.artwork, 400));
const isArtist = computed(() => props.item.type?.includes("artist"));

function open() {
  const route = routeForResource(props.item);
  if (route) router.push(route);
  else void player.playResource(props.item);
}

function playNow(e: Event) {
  e.stopPropagation();
  void player.playResource(props.item);
}
</script>

<template>
  <div class="tile" :class="[size ?? 'm', { round: round || isArtist }]" @click="open">
    <div class="art-wrap">
      <img v-if="art" :src="art" :alt="title" loading="lazy" class="art" />
      <div v-else class="art art-fallback"><Icon name="music" :size="28" /></div>
      <button class="play-fab" title="Play" @click="playNow">
        <Icon name="play" :size="16" />
      </button>
    </div>
    <div class="meta">
      <div class="title" :title="title">{{ title }}</div>
      <div v-if="subtitle" class="subtitle" :title="subtitle">{{ subtitle }}</div>
    </div>
  </div>
</template>

<style scoped>
.tile {
  cursor: pointer;
  width: 176px;
  flex-shrink: 0;
}
.tile.s { width: 140px; }
.tile.l { width: 210px; }

.art-wrap {
  position: relative;
  border-radius: var(--radius-m);
  overflow: hidden;
  aspect-ratio: 1;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  transition: transform 0.25s var(--ease-spring), box-shadow 0.25s ease;
}
.tile.round .art-wrap {
  border-radius: 50%;
}
.tile:hover .art-wrap {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.4);
}

.art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.art-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-tertiary);
}

.play-fab {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-rgb), 0.95);
  color: white;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.2s ease, transform 0.25s var(--ease-spring), filter 0.15s ease;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
.tile:hover .play-fab {
  opacity: 1;
  transform: none;
}
.play-fab:hover {
  filter: brightness(1.12);
}
.tile.round .play-fab {
  right: 6px;
  bottom: 6px;
}

.meta {
  padding: 9px 2px 0;
}
.tile.round .meta {
  text-align: center;
}
.title {
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subtitle {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
</style>
