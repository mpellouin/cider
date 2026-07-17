<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CollectionPage from "@/components/CollectionPage.vue";
import { usePlayer } from "@/stores/player";
import { getPlaylist, getAllPlaylistTracks, type Resource } from "@/lib/api";

const route = useRoute();
const player = usePlayer();

const resource = ref<Resource | null>(null);
const tracks = ref<Resource[]>([]);
const loading = ref(true);
const isLibrary = ref(false);

async function load() {
  const id = String(route.params.id ?? "");
  if (!id || !player.ready) return;
  isLibrary.value = route.query.library === "1";
  loading.value = true;
  resource.value = null;
  tracks.value = [];
  try {
    const playlist = await getPlaylist(id, isLibrary.value);
    resource.value = playlist;
    tracks.value = playlist?.relationships?.tracks?.data ?? [];
    // Long playlists paginate — fetch the rest lazily.
    if (playlist && tracks.value.length >= 100) {
      const all = await getAllPlaylistTracks(id, isLibrary.value);
      if (all.length > tracks.value.length) tracks.value = all;
    }
  } catch {
    resource.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [route.params.id, player.ready], load);
</script>

<template>
  <CollectionPage
    :resource="resource"
    :tracks="tracks"
    :loading="loading"
    kind="playlist"
    :is-library="isLibrary"
  />
</template>
