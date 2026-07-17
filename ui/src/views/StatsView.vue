<script setup lang="ts">
/**
 * Listening Stats — a Cider exclusive.
 * Local, private listening telemetry + Apple's heavy-rotation feed.
 */

import { computed, onMounted, ref, watch } from "vue";
import Icon from "@/components/Icon.vue";
import MediaShelf from "@/components/MediaShelf.vue";
import { useStats } from "@/stores/stats";
import { usePlayer } from "@/stores/player";
import { getHeavyRotation, type Resource } from "@/lib/api";
import { formatMinutes } from "@/lib/time";

const stats = useStats();
const player = usePlayer();
const heavy = ref<Resource[]>([]);

const maxDay = computed(() =>
  Math.max(1, ...stats.dailySeries.map((d) => d.minutes))
);

async function load() {
  if (!player.ready || !player.authorized) return;
  try {
    heavy.value = await getHeavyRotation();
  } catch {
    heavy.value = [];
  }
}

onMounted(load);
watch(() => player.authorized, load);
</script>

<template>
  <div class="page">
    <h1 class="page-heading">Listening Stats</h1>
    <p class="muted intro">
      Tracked locally on this device — your listening habits never leave Cider.
    </p>

    <div class="stat-cards fade-up">
      <div class="stat-card">
        <div class="stat-value">{{ formatMinutes(stats.minutesToday) }}</div>
        <div class="stat-label">today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatMinutes(stats.minutesThisWeek) }}</div>
        <div class="stat-label">this week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ formatMinutes(stats.totalSeconds / 60) }}</div>
        <div class="stat-label">all time</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ Object.keys(stats.tracks).length }}</div>
        <div class="stat-label">unique songs</div>
      </div>
    </div>

    <section class="fade-up block">
      <h2 class="section-title">Last 14 Days</h2>
      <div class="chart">
        <div v-for="(d, i) in stats.dailySeries" :key="i" class="bar-col" :title="`${d.minutes} min`">
          <div class="bar-wrap">
            <div class="bar" :style="{ height: `${(d.minutes / maxDay) * 100}%` }"></div>
          </div>
          <span class="bar-label">{{ d.day }}</span>
        </div>
      </div>
    </section>

    <div class="two-col">
      <section v-if="stats.topTracks.length" class="fade-up">
        <h2 class="section-title">Your Top Songs</h2>
        <ol class="top-list">
          <li v-for="(t, i) in stats.topTracks.slice(0, 10)" :key="t.id">
            <span class="rank">{{ i + 1 }}</span>
            <img v-if="t.artworkUrl" :src="t.artworkUrl" alt="" class="top-art" />
            <div class="top-meta">
              <span class="top-title">{{ t.title }}</span>
              <span class="top-sub">{{ t.artist }}</span>
            </div>
            <span class="top-count">{{ t.plays }}×</span>
          </li>
        </ol>
      </section>

      <section v-if="stats.topArtists.length" class="fade-up">
        <h2 class="section-title">Your Top Artists</h2>
        <ol class="top-list">
          <li v-for="(a, i) in stats.topArtists.slice(0, 10)" :key="a.name">
            <span class="rank">{{ i + 1 }}</span>
            <div class="top-meta">
              <span class="top-title">{{ a.name }}</span>
              <span class="top-sub">{{ formatMinutes(a.seconds / 60) }}</span>
            </div>
            <span class="top-count">{{ a.plays }}×</span>
          </li>
        </ol>
      </section>
    </div>

    <MediaShelf title="Heavy Rotation (Apple)" :items="heavy" />

    <div v-if="!stats.topTracks.length" class="empty muted">
      <Icon name="stats" :size="28" />
      <p>Play some music and your stats will grow here.</p>
    </div>
  </div>
</template>

<style scoped>
.intro {
  margin-top: -14px;
  margin-bottom: 26px;
  font-size: 13px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 14px;
  margin-bottom: 34px;
}
.stat-card {
  padding: 20px;
  border-radius: var(--radius-l);
  background: linear-gradient(150deg, rgba(var(--accent-rgb), 0.16), var(--surface) 70%);
  border: 1px solid var(--border);
}
.stat-value {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.stat-label {
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  font-weight: 700;
  margin-top: 4px;
}

.block {
  margin-bottom: 34px;
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 160px;
  padding: 16px;
  border-radius: var(--radius-l);
  background: var(--surface);
  border: 1px solid var(--border);
}
.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}
.bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: min(26px, 70%);
  min-height: 3px;
  border-radius: 6px 6px 3px 3px;
  background: linear-gradient(to top, rgba(var(--accent-rgb), 0.55), var(--accent));
  transition: height 0.6s var(--ease-spring);
}
.bar-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  font-weight: 700;
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 34px;
}
@media (max-width: 900px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}

.top-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.top-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 10px;
}
.top-list li:hover {
  background: var(--surface-hover);
}
.rank {
  width: 20px;
  text-align: center;
  font-weight: 800;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.top-art {
  width: 36px;
  height: 36px;
  border-radius: 7px;
  object-fit: cover;
}
.top-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.top-title {
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.top-sub {
  font-size: 11.5px;
  color: var(--text-secondary);
}
.top-count {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 50px 0;
}
</style>
