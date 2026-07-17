<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import MediaShelf from "@/components/MediaShelf.vue";
import TrackList from "@/components/TrackList.vue";
import { usePlayer } from "@/stores/player";
import { search as searchApi, type SearchResults } from "@/lib/api";

const player = usePlayer();
const term = ref("");
const results = ref<SearchResults | null>(null);
const loading = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer = 0;
let seq = 0;

watch(term, () => {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(run, 320);
});

async function run() {
  const q = term.value.trim();
  if (!q || !player.ready) {
    results.value = null;
    return;
  }
  const current = ++seq;
  loading.value = true;
  try {
    const res = await searchApi(q);
    if (current === seq) results.value = res;
  } catch {
    if (current === seq) results.value = null;
  } finally {
    if (current === seq) loading.value = false;
  }
}

onMounted(() => inputEl.value?.focus());
</script>

<template>
  <div class="page">
    <h1 class="page-heading">Search</h1>

    <div class="search-box" :class="{ busy: loading }">
      <Icon name="search" :size="18" />
      <input
        ref="inputEl"
        v-model="term"
        placeholder="Songs, artists, albums, playlists…"
        spellcheck="false"
      />
      <span v-if="loading" class="spinner"></span>
    </div>

    <template v-if="results">
      <section v-if="results.songs.length" class="fade-up result-block">
        <h2 class="section-title">Songs</h2>
        <TrackList :tracks="results.songs.slice(0, 10)" />
      </section>

      <MediaShelf title="Artists" :items="results.artists" round size="s" />
      <MediaShelf title="Albums" :items="results.albums" />
      <MediaShelf title="Playlists" :items="results.playlists" />
      <MediaShelf title="Stations" :items="results.stations" size="s" />
    </template>

    <div v-else-if="!term" class="hint muted">
      <Icon name="sparkles" :size="22" />
      <p>Type to search the entire Apple Music catalog.<br />Tip: press <kbd>⌘K</kbd> anywhere for instant search.</p>
    </div>
  </div>
</template>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 18px;
  border-radius: var(--radius-m);
  background: var(--surface);
  border: 1px solid var(--border);
  margin-bottom: 30px;
  color: var(--text-secondary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.search-box:focus-within {
  border-color: rgba(var(--accent-rgb), 0.55);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.15);
}
.search-box input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 16px;
  color: var(--text);
}

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--surface-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.result-block {
  margin-bottom: 32px;
}

.hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 70px 0;
  text-align: center;
}
kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
}
</style>
