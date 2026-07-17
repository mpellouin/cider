<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import CollectionPage from "@/components/CollectionPage.vue";
import { usePlayer } from "@/stores/player";
import { getAlbum, type Resource } from "@/lib/api";

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
    const album = await getAlbum(id, isLibrary.value);
    resource.value = album;
    tracks.value = album?.relationships?.tracks?.data ?? [];
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
    kind="album"
    :is-library="isLibrary"
  />
</template>
