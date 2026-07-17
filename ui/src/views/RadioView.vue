<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import MediaShelf from "@/components/MediaShelf.vue";
import Icon from "@/components/Icon.vue";
import { usePlayer } from "@/stores/player";
import { getLiveStations, getRecentStations, type Resource } from "@/lib/api";
import { artworkUrl } from "@/lib/artwork";

const player = usePlayer();
const live = ref<Resource[]>([]);
const recent = ref<Resource[]>([]);
const loading = ref(true);

async function load() {
  if (!player.ready) return;
  loading.value = true;
  const [liveRes, recentRes] = await Promise.allSettled([
    getLiveStations(),
    player.authorized ? getRecentStations() : Promise.resolve([]),
  ]);
  if (liveRes.status === "fulfilled") live.value = liveRes.value;
  if (recentRes.status === "fulfilled") recent.value = recentRes.value;
  loading.value = false;
}

onMounted(load);
watch(() => [player.ready, player.authorized], load);
</script>

<template>
  <div class="page">
    <h1 class="page-heading">Radio</h1>

    <!-- Live stations hero -->
    <div v-if="live.length" class="live-grid fade-up">
      <button
        v-for="station in live"
        :key="station.id"
        class="live-card"
        @click="player.playResource(station)"
      >
        <img :src="artworkUrl(station.attributes?.artwork, 600)" alt="" class="live-art" />
        <div class="live-overlay">
          <span class="live-badge">● LIVE</span>
          <div>
            <div class="live-name">{{ station.attributes?.name }}</div>
            <div class="live-tagline">{{ station.attributes?.editorialNotes?.short }}</div>
          </div>
          <span class="live-play"><Icon name="play" :size="18" /></span>
        </div>
      </button>
    </div>
    <div v-else-if="loading" class="live-grid">
      <div class="skeleton live-card" v-for="i in 3" :key="i"></div>
    </div>

    <MediaShelf title="Recent Stations" :items="recent" />
  </div>
</template>

<style scoped>
.live-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
  margin-bottom: 36px;
}

.live-card {
  position: relative;
  aspect-ratio: 16 / 8.5;
  border-radius: var(--radius-l);
  overflow: hidden;
  text-align: left;
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.3);
  transition: transform 0.25s var(--ease-spring), box-shadow 0.25s ease;
}
.live-card:hover {
  transform: translateY(-3px) scale(1.015);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.45);
}

.live-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.live-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  background: linear-gradient(transparent 30%, rgba(0, 0, 0, 0.75));
  color: white;
}

.live-badge {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 45, 85, 0.9);
}

.live-name {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.live-tagline {
  font-size: 12px;
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90%;
}

.live-play {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  color: #111;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.2s ease, transform 0.25s var(--ease-spring);
}
.live-card:hover .live-play {
  opacity: 1;
  transform: none;
}
</style>
