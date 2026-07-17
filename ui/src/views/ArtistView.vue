<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "@/components/Icon.vue";
import MediaShelf from "@/components/MediaShelf.vue";
import TrackList from "@/components/TrackList.vue";
import { usePlayer } from "@/stores/player";
import { getArtist, type ArtistPage } from "@/lib/api";
import { artworkUrl } from "@/lib/artwork";

const route = useRoute();
const player = usePlayer();

const page = ref<ArtistPage | null>(null);
const loading = ref(true);

const attrs = computed(() => page.value?.artist?.attributes);
const heroArt = computed(() => {
  const editorial = (attrs.value as any)?.editorialArtwork?.centeredFullscreenBackground
    ?? (attrs.value as any)?.editorialArtwork?.subscriptionHero;
  return artworkUrl(editorial ?? attrs.value?.artwork, 1200);
});

async function load() {
  const id = String(route.params.id ?? "");
  if (!id || !player.ready) return;
  loading.value = true;
  page.value = null;
  try {
    page.value = await getArtist(id);
  } catch {
    page.value = null;
  } finally {
    loading.value = false;
  }
}

function playTop() {
  if (page.value?.topSongs.length) {
    void player.playSongs(page.value.topSongs, 0);
  } else if (page.value?.artist) {
    void player.playResource(page.value.artist);
  }
}

onMounted(load);
watch(() => [route.params.id, player.ready], load);
</script>

<template>
  <div>
    <div v-if="loading" class="page">
      <div class="skeleton hero-skel"></div>
    </div>

    <template v-else-if="page?.artist">
      <div class="artist-hero" :class="{ 'no-art': !heroArt }">
        <img v-if="heroArt" :src="heroArt" alt="" class="artist-bg" />
        <div class="artist-scrim"></div>
        <div class="artist-head">
          <h1>{{ attrs?.name }}</h1>
          <div class="artist-genres">{{ attrs?.genreNames?.slice(0, 3).join(" · ") }}</div>
          <button class="pill-btn" @click="playTop"><Icon name="play" :size="15" /> Play</button>
        </div>
      </div>

      <div class="page">
        <section v-if="page.topSongs.length" class="fade-up block">
          <h2 class="section-title">Top Songs</h2>
          <TrackList :tracks="page.topSongs.slice(0, 10)" />
        </section>

        <MediaShelf title="Latest Release" :items="page.latestRelease" />
        <MediaShelf title="Albums" :items="page.albums" />
        <MediaShelf title="Similar Artists" :items="page.similar" round size="s" />
      </div>
    </template>

    <div v-else class="page empty muted"><p>Couldn't load this artist.</p></div>
  </div>
</template>

<style scoped>
.hero-skel {
  height: 300px;
}

.artist-hero {
  position: relative;
  height: 330px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.artist-hero.no-art {
  height: 200px;
  background: linear-gradient(160deg, rgba(var(--accent-rgb), 0.35), transparent);
}
.artist-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 20%;
}
.artist-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 20%, color-mix(in srgb, var(--bg) 92%, transparent));
}
.artist-head {
  position: relative;
  padding: 0 32px 26px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.artist-head h1 {
  font-size: clamp(30px, 4.5vw, 54px);
  font-weight: 800;
  letter-spacing: -0.03em;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
}
.artist-genres {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

.block {
  margin-bottom: 34px;
}
.empty {
  text-align: center;
  padding: 100px 0;
}
</style>
