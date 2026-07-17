<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import Icon from "./Icon.vue";
import { usePlayer } from "@/stores/player";
import { getLibrary, type Resource } from "@/lib/api";
import { artworkUrl } from "@/lib/artwork";
import { watch } from "vue";

const player = usePlayer();
const playlists = ref<Resource[]>([]);

async function loadPlaylists() {
  if (!player.authorized) return;
  try {
    const res = await getLibrary("playlists", 0, 40);
    playlists.value = res.items;
  } catch {
    /* library unavailable pre-auth */
  }
}

onMounted(loadPlaylists);
watch(() => player.authorized, loadPlaylists);

const mainNav = [
  { to: "/", icon: "home", label: "Home" },
  { to: "/browse", icon: "browse", label: "Browse" },
  { to: "/radio", icon: "radio", label: "Radio" },
  { to: "/search", icon: "search", label: "Search" },
];

const libraryNav = [
  { to: "/library/recently-added", icon: "clock", label: "Recently Added" },
  { to: "/library/artists", icon: "music", label: "Artists" },
  { to: "/library/albums", icon: "library", label: "Albums" },
  { to: "/library/songs", icon: "lyrics", label: "Songs" },
];
</script>

<template>
  <aside class="sidebar">
    <div class="brand" data-tauri-drag-region>
      <img src="/cider-icon.png" alt="" class="brand-icon" />
      <span class="brand-name">Cider</span>
    </div>

    <nav class="nav-block">
      <RouterLink v-for="item in mainNav" :key="item.to" :to="item.to" class="nav-item">
        <Icon :name="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="nav-label">Library</div>
    <nav class="nav-block">
      <RouterLink v-for="item in libraryNav" :key="item.to" :to="item.to" class="nav-item">
        <Icon :name="item.icon" :size="17" />
        <span>{{ item.label }}</span>
      </RouterLink>
      <RouterLink to="/stats" class="nav-item">
        <Icon name="stats" :size="17" />
        <span>Listening Stats</span>
      </RouterLink>
    </nav>

    <template v-if="playlists.length">
      <div class="nav-label">Playlists</div>
      <nav class="nav-block playlists">
        <RouterLink
          v-for="pl in playlists"
          :key="pl.id"
          :to="{ name: 'playlist', params: { id: pl.id }, query: { library: '1' } }"
          class="nav-item playlist-item"
        >
          <img
            v-if="pl.attributes?.artwork"
            class="pl-art"
            :src="artworkUrl(pl.attributes.artwork, 64)"
            alt=""
            loading="lazy"
          />
          <span v-else class="pl-art pl-art-fallback"><Icon name="music" :size="12" /></span>
          <span class="pl-name">{{ pl.attributes?.name }}</span>
        </RouterLink>
      </nav>
    </template>

    <div class="sidebar-footer">
      <RouterLink to="/settings" class="nav-item">
        <Icon name="settings" :size="17" />
        <span>Settings</span>
      </RouterLink>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  padding: 12px 12px 8px;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 65%, transparent);
  backdrop-filter: blur(30px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 14px;
}
.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.brand-name {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.nav-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  padding: 14px 10px 6px;
}

.nav-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 13.5px;
  transition: background 0.14s ease, color 0.14s ease;
  white-space: nowrap;
}
.nav-item:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.nav-item.router-link-active {
  background: rgba(var(--accent-rgb), 0.14);
  color: var(--accent);
}

.playlists {
  min-height: 0;
}
.playlist-item {
  padding: 6px 10px;
}
.pl-art {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
}
.pl-art-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-tertiary);
}
.pl-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
</style>
