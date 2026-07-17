<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import { artworkUrl } from "@/lib/artwork";
import { formatMillis } from "@/lib/time";
import { usePlayer } from "@/stores/player";

const props = defineProps<{
  tracks: MusicKit.MediaItem[];
  /** hide per-row artwork when the whole list shares one album cover */
  hideArt?: boolean;
  showIndex?: boolean;
}>();

const player = usePlayer();

const playingId = computed(() => player.nowPlaying?.id ?? "");

function isCurrent(track: MusicKit.MediaItem): boolean {
  const npId = playingId.value;
  if (!npId) return false;
  return (
    track.id === npId ||
    track.attributes?.playParams?.id === npId ||
    track.attributes?.playParams?.catalogId === player.nowPlaying?.catalogId
  );
}

function play(index: number) {
  void player.playSongs(props.tracks, index);
}
</script>

<template>
  <div class="tracklist">
    <button
      v-for="(track, index) in tracks"
      :key="track.id + '-' + index"
      class="track-row"
      :class="{ current: isCurrent(track) }"
      @dblclick="play(index)"
      @click="play(index)"
    >
      <span v-if="showIndex" class="cell-index">
        <span v-if="isCurrent(track) && player.isPlaying" class="eq">
          <i></i><i></i><i></i>
        </span>
        <span v-else class="num">{{ track.attributes?.trackNumber ?? index + 1 }}</span>
        <Icon name="play" :size="13" class="row-play" />
      </span>

      <img
        v-if="!hideArt"
        class="cell-art"
        :src="artworkUrl(track.attributes?.artwork, 96)"
        alt=""
        loading="lazy"
      />

      <span class="cell-main">
        <span class="t-title">
          {{ track.attributes?.name }}
          <span v-if="track.attributes?.contentRating === 'explicit'" class="explicit">E</span>
        </span>
        <span class="t-artist">{{ track.attributes?.artistName }}</span>
      </span>

      <span class="cell-album">{{ track.attributes?.albumName }}</span>

      <span class="cell-actions">
        <span
          class="icon-btn sm"
          role="button"
          title="Play next"
          @click.stop="player.queueNext(track)"
        >
          <Icon name="queue" :size="15" />
        </span>
      </span>

      <span class="cell-duration">{{ formatMillis(track.attributes?.durationInMillis) }}</span>
    </button>
  </div>
</template>

<style scoped>
.tracklist {
  display: flex;
  flex-direction: column;
}

.track-row {
  display: grid;
  grid-template-columns: auto auto 1fr minmax(0, 0.8fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 7px 12px;
  border-radius: 10px;
  text-align: left;
  transition: background 0.12s ease;
}
.tracklist .track-row:nth-child(odd) {
  background: color-mix(in srgb, var(--surface) 55%, transparent);
}
.track-row:hover {
  background: var(--surface-hover);
}
.track-row.current {
  background: rgba(var(--accent-rgb), 0.12);
}
.track-row.current .t-title {
  color: var(--accent);
}

.cell-index {
  width: 26px;
  display: inline-flex;
  justify-content: center;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  position: relative;
}
.row-play {
  display: none;
  color: var(--text);
}
.track-row:hover .num,
.track-row:hover .eq {
  display: none;
}
.track-row:hover .row-play {
  display: block;
}

.eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}
.eq i {
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
  animation: eq-bounce 0.9s infinite ease-in-out;
}
.eq i:nth-child(2) { animation-delay: 0.25s; }
.eq i:nth-child(3) { animation-delay: 0.5s; }
@keyframes eq-bounce {
  0%, 100% { height: 4px; }
  50% { height: 13px; }
}

.cell-art {
  width: 38px;
  height: 38px;
  border-radius: 7px;
  object-fit: cover;
  background: var(--surface-active);
}

.cell-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.t-title {
  font-weight: 500;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.explicit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 9px;
  font-weight: 800;
  border-radius: 3px;
  background: var(--surface-active);
  color: var(--text-secondary);
  vertical-align: 1px;
  margin-left: 4px;
}
.t-artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-album {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-actions {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.track-row:hover .cell-actions {
  opacity: 1;
}
.icon-btn.sm {
  width: 28px;
  height: 28px;
}

.cell-duration {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  width: 44px;
  text-align: right;
}

@media (max-width: 1100px) {
  .cell-album {
    display: none;
  }
  .track-row {
    grid-template-columns: auto auto 1fr auto auto;
  }
}
</style>
