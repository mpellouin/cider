<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import MediaShelf from "@/components/MediaShelf.vue";
import TrackList from "@/components/TrackList.vue";
import { usePlayer } from "@/stores/player";
import { getCharts, type Charts } from "@/lib/api";

const player = usePlayer();
const charts = ref<Charts | null>(null);
const loading = ref(true);

async function load() {
  if (!player.ready) return;
  loading.value = true;
  try {
    charts.value = await getCharts();
  } catch {
    charts.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => player.ready, load);
</script>

<template>
  <div class="page">
    <h1 class="page-heading">Browse</h1>

    <template v-if="loading">
      <div class="skeleton block" v-for="i in 2" :key="i"></div>
    </template>

    <template v-else-if="charts">
      <MediaShelf title="Top Albums" :items="charts.albums" />
      <MediaShelf title="Top Playlists" :items="charts.playlists" />

      <section v-if="charts.songs.length" class="fade-up">
        <h2 class="section-title">Top Songs</h2>
        <TrackList :tracks="charts.songs.slice(0, 20)" show-index />
      </section>
    </template>

    <p v-else class="muted">Charts are unavailable right now.</p>
  </div>
</template>

<style scoped>
.skeleton.block {
  height: 230px;
  margin-bottom: 30px;
}
</style>
