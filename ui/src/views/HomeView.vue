<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import MediaShelf from "@/components/MediaShelf.vue";
import Icon from "@/components/Icon.vue";
import { usePlayer } from "@/stores/player";
import {
  getRecommendations,
  getRecentlyPlayed,
  type RecommendationRow,
  type Resource,
} from "@/lib/api";

const player = usePlayer();
const rows = ref<RecommendationRow[]>([]);
const recent = ref<Resource[]>([]);
const loading = ref(true);
const failed = ref(false);

const greeting = (() => {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
})();

async function load() {
  if (!player.ready || !player.authorized) {
    loading.value = false;
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    const [recs, played] = await Promise.allSettled([getRecommendations(), getRecentlyPlayed()]);
    if (recs.status === "fulfilled") rows.value = recs.value;
    if (played.status === "fulfilled") recent.value = played.value;
    failed.value = rows.value.length === 0 && recent.value.length === 0;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => player.authorized, load);
</script>

<template>
  <div class="page">
    <h1 class="page-heading">{{ greeting }}</h1>

    <template v-if="!player.authorized">
      <div class="empty-state fade-up">
        <Icon name="apple" :size="40" />
        <h2>Welcome to Cider</h2>
        <p class="muted">
          Sign in with your Apple ID to see your personal mixes, library and
          recommendations — or explore the catalog from Browse.
        </p>
        <button class="pill-btn" @click="player.authorize()">
          <Icon name="apple" :size="15" /> Sign in with Apple
        </button>
      </div>
    </template>

    <template v-else-if="loading">
      <div class="shelf-skeleton" v-for="i in 3" :key="i">
        <div class="skeleton line"></div>
        <div class="row">
          <div class="skeleton tile" v-for="j in 6" :key="j"></div>
        </div>
      </div>
    </template>

    <template v-else>
      <MediaShelf title="Recently Played" :items="recent" size="s" />
      <MediaShelf v-for="row in rows" :key="row.id" :title="row.title" :items="row.items" />
      <div v-if="failed" class="empty-state">
        <p class="muted">Couldn't load your recommendations. Pull some fresh air and retry.</p>
        <button class="pill-btn ghost" @click="load">Retry</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 20px;
  text-align: center;
  color: var(--text);
}
.empty-state p {
  max-width: 420px;
}

.shelf-skeleton {
  margin-bottom: 36px;
}
.skeleton.line {
  width: 200px;
  height: 22px;
  margin-bottom: 16px;
}
.row {
  display: flex;
  gap: 18px;
  overflow: hidden;
}
.skeleton.tile {
  width: 176px;
  height: 220px;
  flex-shrink: 0;
}
</style>
