<script setup lang="ts">
/**
 * ⌘K command palette — instant search across Apple Music.
 * Enter plays the highlighted result; ⌘Enter opens its page.
 */

import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { usePlayer } from "@/stores/player";
import { search, type Resource } from "@/lib/api";
import { artworkUrl } from "@/lib/artwork";
import { routeForResource } from "@/router";

const player = usePlayer();
const router = useRouter();

const input = ref<HTMLInputElement | null>(null);
const term = ref("");
const results = ref<Resource[]>([]);
const highlighted = ref(0);
const loading = ref(false);

let debounceTimer = 0;
let requestSeq = 0;

watch(
  () => player.showPalette,
  async (open) => {
    if (open) {
      term.value = "";
      results.value = [];
      highlighted.value = 0;
      await nextTick();
      input.value?.focus();
    }
  }
);

watch(term, (value) => {
  window.clearTimeout(debounceTimer);
  if (!value.trim()) {
    results.value = [];
    return;
  }
  debounceTimer = window.setTimeout(runSearch, 220);
});

async function runSearch() {
  const q = term.value.trim();
  if (!q || !player.ready) return;
  const seq = ++requestSeq;
  loading.value = true;
  try {
    const res = await search(q);
    if (seq !== requestSeq) return;
    // Interleave: top songs first, then a few of each other type.
    results.value = [
      ...res.songs.slice(0, 5),
      ...res.albums.slice(0, 3),
      ...res.artists.slice(0, 3),
      ...res.playlists.slice(0, 3),
    ];
    highlighted.value = 0;
  } catch {
    /* transient search errors are non-fatal */
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

const typeLabel: Record<string, string> = {
  songs: "Song",
  albums: "Album",
  artists: "Artist",
  playlists: "Playlist",
  stations: "Station",
};

function close() {
  player.showPalette = false;
}

function activate(item: Resource, openPage = false) {
  close();
  if (openPage || item.type === "artists") {
    const route = routeForResource(item);
    if (route) {
      router.push(route);
      return;
    }
  }
  void player.playResource(item);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    close();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    highlighted.value = Math.min(highlighted.value + 1, results.value.length - 1);
    scrollToHighlighted();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlighted.value = Math.max(highlighted.value - 1, 0);
    scrollToHighlighted();
  } else if (e.key === "Enter") {
    const item = results.value[highlighted.value];
    if (item) activate(item, e.metaKey || e.ctrlKey);
  }
}

const listEl = ref<HTMLElement | null>(null);
function scrollToHighlighted() {
  nextTick(() => {
    listEl.value
      ?.querySelector<HTMLElement>(`[data-idx="${highlighted.value}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

const emptyHint = computed(() =>
  term.value.trim() ? (loading.value ? "" : "No results") : "Search songs, albums, artists…"
);
</script>

<template>
  <Transition name="palette">
    <div v-if="player.showPalette" class="palette-backdrop" @mousedown.self="close">
      <div class="palette" role="dialog" aria-label="Search">
        <div class="palette-input-row">
          <Icon name="search" :size="17" />
          <input
            ref="input"
            v-model="term"
            class="palette-input"
            placeholder="Search Apple Music…"
            spellcheck="false"
            @keydown="onKeydown"
          />
          <span v-if="loading" class="spinner"></span>
          <kbd v-else>esc</kbd>
        </div>

        <div v-if="results.length" ref="listEl" class="palette-results">
          <button
            v-for="(item, i) in results"
            :key="item.type + item.id"
            :data-idx="i"
            class="palette-row"
            :class="{ highlighted: i === highlighted }"
            @mousemove="highlighted = i"
            @click="activate(item)"
          >
            <img
              v-if="item.attributes?.artwork"
              :src="artworkUrl(item.attributes.artwork, 80)"
              alt=""
              class="p-art"
              :class="{ round: item.type === 'artists' }"
            />
            <div v-else class="p-art p-fallback"><Icon name="music" :size="14" /></div>
            <div class="p-meta">
              <span class="p-title">{{ item.attributes?.name }}</span>
              <span class="p-sub">
                {{ typeLabel[item.type] ?? item.type }}
                <template v-if="item.attributes?.artistName"> · {{ item.attributes.artistName }}</template>
              </span>
            </div>
            <span class="p-action"><Icon name="play" :size="13" /> Play</span>
          </button>
        </div>
        <div v-else class="palette-empty">{{ emptyHint }}</div>

        <div class="palette-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> play</span>
          <span><kbd>⌘↵</kbd> open</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  padding-top: 12vh;
}

.palette {
  width: min(620px, 90vw);
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-l);
  background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  overflow: hidden;
  align-self: flex-start;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.palette-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 16px;
  color: var(--text);
}
.palette-input::placeholder {
  color: var(--text-tertiary);
}
kbd {
  font-family: inherit;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-tertiary);
}

.spinner {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid var(--surface-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.palette-results {
  overflow-y: auto;
  padding: 8px;
}
.palette-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  text-align: left;
}
.palette-row.highlighted {
  background: rgba(var(--accent-rgb), 0.14);
}
.p-art {
  width: 38px;
  height: 38px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
}
.p-art.round {
  border-radius: 50%;
}
.p-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-tertiary);
}
.p-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.p-title {
  font-weight: 600;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.p-sub {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.p-action {
  display: none;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}
.palette-row.highlighted .p-action {
  display: inline-flex;
}

.palette-empty {
  padding: 34px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13.5px;
}

.palette-foot {
  display: flex;
  gap: 16px;
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.18s ease;
}
.palette-enter-active .palette,
.palette-leave-active .palette {
  transition: transform 0.22s var(--ease-spring), opacity 0.18s ease;
}
.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
.palette-enter-from .palette {
  transform: translateY(-14px) scale(0.98);
}
</style>
