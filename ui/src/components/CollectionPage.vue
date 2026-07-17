<script setup lang="ts">
/** Shared album/playlist detail layout: hero header + track list. */

import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import TrackList from "./TrackList.vue";
import { artworkUrl } from "@/lib/artwork";
import { formatMinutes } from "@/lib/time";
import { usePlayer } from "@/stores/player";
import { addToLibrary } from "@/lib/api";

const props = defineProps<{
  resource: MusicKit.MediaItem | null;
  tracks: MusicKit.MediaItem[];
  loading: boolean;
  kind: "album" | "playlist";
  isLibrary: boolean;
}>();

const player = usePlayer();
const added = ref(false);
const addBusy = ref(false);

const attrs = computed(() => props.resource?.attributes);
const art = computed(() => artworkUrl(attrs.value?.artwork, 800));
const subtitle = computed(
  () => attrs.value?.artistName ?? attrs.value?.curatorName ?? ""
);
const description = computed(
  () =>
    attrs.value?.editorialNotes?.standard ??
    attrs.value?.description?.standard ??
    ""
);

const totalMinutes = computed(() =>
  props.tracks.reduce((sum, t) => sum + (t.attributes?.durationInMillis ?? 0), 0) / 60000
);

const metaLine = computed(() => {
  const parts: string[] = [];
  const genre = attrs.value?.genreNames?.[0];
  const year = attrs.value?.releaseDate?.slice(0, 4);
  if (genre) parts.push(genre);
  if (year) parts.push(year);
  if (props.tracks.length) parts.push(`${props.tracks.length} songs`);
  if (totalMinutes.value > 0) parts.push(formatMinutes(totalMinutes.value));
  return parts.join(" · ");
});

function playAll(shuffle = false) {
  if (!props.resource) return;
  if (shuffle && props.tracks.length) {
    const shuffled = [...props.tracks].sort(() => Math.random() - 0.5);
    void player.playSongs(shuffled, 0);
  } else if (props.tracks.length) {
    void player.playSongs(props.tracks, 0);
  } else {
    void player.playResource(props.resource);
  }
}

async function addLibrary() {
  if (!props.resource || props.isLibrary || added.value) return;
  addBusy.value = true;
  try {
    await addToLibrary(props.kind === "album" ? "albums" : "playlists", props.resource.id);
    added.value = true;
  } catch (err) {
    console.warn("[cider] add to library failed:", err);
  } finally {
    addBusy.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div v-if="loading && !resource" class="hero-skeleton">
      <div class="skeleton art"></div>
      <div class="lines">
        <div class="skeleton l1"></div>
        <div class="skeleton l2"></div>
        <div class="skeleton l3"></div>
      </div>
    </div>

    <template v-else-if="resource">
      <div class="hero fade-up">
        <div class="hero-art-wrap">
          <img v-if="art" :src="art" alt="" class="hero-art" />
          <img v-if="art" :src="art" alt="" class="hero-glow" aria-hidden="true" />
        </div>
        <div class="hero-info">
          <div class="hero-kind">{{ kind === "album" ? "Album" : "Playlist" }}</div>
          <h1 class="hero-title">{{ attrs?.name }}</h1>
          <div v-if="subtitle" class="hero-subtitle">{{ subtitle }}</div>
          <div class="hero-meta">{{ metaLine }}</div>
          <p v-if="description" class="hero-desc" v-text="description.replace(/<[^>]+>/g, '')"></p>

          <div class="hero-actions">
            <button class="pill-btn" @click="playAll(false)">
              <Icon name="play" :size="15" /> Play
            </button>
            <button class="pill-btn ghost" @click="playAll(true)">
              <Icon name="shuffle" :size="15" /> Shuffle
            </button>
            <button
              v-if="!isLibrary"
              class="icon-btn"
              :class="{ active: added }"
              :title="added ? 'In your library' : 'Add to library'"
              :disabled="addBusy"
              @click="addLibrary"
            >
              <Icon :name="added ? 'check' : 'plus'" :size="18" />
            </button>
          </div>
        </div>
      </div>

      <TrackList :tracks="tracks" hide-art show-index class="fade-up" />
      <div v-if="loading" class="more-loading"><span class="spinner"></span></div>
    </template>

    <div v-else class="empty muted">
      <p>Couldn't load this {{ kind }}.</p>
    </div>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  gap: 30px;
  align-items: flex-end;
  margin-bottom: 30px;
}

.hero-art-wrap {
  position: relative;
  flex-shrink: 0;
}
.hero-art {
  width: 232px;
  height: 232px;
  border-radius: var(--radius-l);
  object-fit: cover;
  position: relative;
  z-index: 1;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}
.hero-glow {
  position: absolute;
  inset: 8%;
  width: 84%;
  height: 84%;
  filter: blur(40px) saturate(1.8);
  opacity: 0.55;
  z-index: 0;
}

.hero-info {
  min-width: 0;
  padding-bottom: 6px;
}
.hero-kind {
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent);
  margin-bottom: 6px;
}
.hero-title {
  font-size: clamp(24px, 3.4vw, 42px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.hero-subtitle {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 6px;
}
.hero-meta {
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-top: 8px;
}
.hero-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 12px;
  max-width: 640px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.hero-skeleton {
  display: flex;
  gap: 30px;
  margin-bottom: 30px;
}
.skeleton.art {
  width: 232px;
  height: 232px;
}
.lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  padding-bottom: 10px;
}
.skeleton.l1 { width: 45%; height: 38px; }
.skeleton.l2 { width: 25%; height: 20px; }
.skeleton.l3 { width: 60%; height: 14px; }

.more-loading {
  display: flex;
  justify-content: center;
  padding: 20px;
}
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--surface-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty {
  padding: 80px 0;
  text-align: center;
}
</style>
