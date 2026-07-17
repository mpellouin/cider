<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import MediaTile from "@/components/MediaTile.vue";
import TrackList from "@/components/TrackList.vue";
import { usePlayer } from "@/stores/player";
import { getLibrary, type Resource } from "@/lib/api";

type Tab = "recently-added" | "albums" | "playlists" | "songs" | "artists";

const route = useRoute();
const router = useRouter();
const player = usePlayer();

const tabs: { key: Tab; label: string }[] = [
  { key: "recently-added", label: "Recently Added" },
  { key: "playlists", label: "Playlists" },
  { key: "albums", label: "Albums" },
  { key: "songs", label: "Songs" },
  { key: "artists", label: "Artists" },
];

const tab = computed<Tab>(() => {
  const t = String(route.params.tab ?? "recently-added") as Tab;
  return tabs.some((x) => x.key === t) ? t : "recently-added";
});

const items = ref<Resource[]>([]);
const loading = ref(false);
const hasMore = ref(false);
const offset = ref(0);
const filter = ref("");

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((item) => {
    const a = item.attributes;
    return (
      a?.name?.toLowerCase().includes(q) ||
      a?.artistName?.toLowerCase().includes(q) ||
      a?.albumName?.toLowerCase().includes(q)
    );
  });
});

async function load(reset = true) {
  if (!player.ready || !player.authorized) return;
  if (reset) {
    items.value = [];
    offset.value = 0;
  }
  loading.value = true;
  try {
    const pageSize = tab.value === "songs" ? 100 : 50;
    const res = await getLibrary(tab.value, offset.value, pageSize);
    items.value = reset ? res.items : [...items.value, ...res.items];
    hasMore.value = res.hasMore;
    offset.value += res.items.length;
  } catch {
    if (reset) items.value = [];
  } finally {
    loading.value = false;
  }
}

function switchTab(key: Tab) {
  router.replace({ name: "library", params: { tab: key } });
}

onMounted(() => void load());
watch(tab, () => void load());
watch(() => player.authorized, () => void load());
</script>

<template>
  <div class="page">
    <h1 class="page-heading">Library</h1>

    <div class="lib-toolbar">
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ active: t.key === tab }"
          @click="switchTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="filter-box">
        <Icon name="search" :size="14" />
        <input v-model="filter" placeholder="Filter" spellcheck="false" />
      </div>
    </div>

    <div v-if="!player.authorized" class="empty muted">
      <Icon name="apple" :size="26" />
      <p>Sign in to browse your library.</p>
      <button class="pill-btn" @click="player.authorize()">Sign in</button>
    </div>

    <template v-else>
      <TrackList v-if="tab === 'songs'" :tracks="filtered" />

      <div v-else class="tile-grid">
        <MediaTile
          v-for="item in filtered"
          :key="item.id"
          :item="item"
          :round="tab === 'artists'"
        />
      </div>

      <div v-if="loading" class="loading-row">
        <span class="spinner"></span>
      </div>
      <div v-else-if="hasMore && !filter" class="loading-row">
        <button class="pill-btn ghost" @click="load(false)">Load more</button>
      </div>
      <div v-else-if="!loading && items.length === 0" class="empty muted">
        <p>Nothing here yet.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lib-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 26px;
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  gap: 4px;
  background: var(--surface);
  padding: 4px;
  border-radius: 999px;
}
.tab {
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  background: var(--accent);
  color: white;
  box-shadow: 0 3px 12px rgba(var(--accent-rgb), 0.35);
}

.filter-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-tertiary);
}
.filter-box input {
  background: none;
  border: none;
  outline: none;
  width: 140px;
  font-size: 13px;
  color: var(--text);
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 22px 18px;
}
.tile-grid :deep(.tile) {
  width: 100%;
}

.loading-row {
  display: flex;
  justify-content: center;
  padding: 30px;
}
.spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--surface-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 70px 0;
}
</style>
