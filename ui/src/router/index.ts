import { createRouter, createWebHashHistory } from "vue-router";

// Hash history keeps routing working under file:// (no server to honour
// deep links) — important for the Electron shell's loadFile().
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "home", component: () => import("@/views/HomeView.vue") },
    { path: "/browse", name: "browse", component: () => import("@/views/BrowseView.vue") },
    { path: "/radio", name: "radio", component: () => import("@/views/RadioView.vue") },
    { path: "/search", name: "search", component: () => import("@/views/SearchView.vue") },
    { path: "/library/:tab?", name: "library", component: () => import("@/views/LibraryView.vue") },
    { path: "/album/:id", name: "album", component: () => import("@/views/AlbumView.vue") },
    { path: "/playlist/:id", name: "playlist", component: () => import("@/views/PlaylistView.vue") },
    { path: "/artist/:id", name: "artist", component: () => import("@/views/ArtistView.vue") },
    { path: "/stats", name: "stats", component: () => import("@/views/StatsView.vue") },
    { path: "/settings", name: "settings", component: () => import("@/views/SettingsView.vue") },
  ],
  scrollBehavior() {
    const el = document.querySelector(".page-scroll");
    if (el) el.scrollTop = 0;
    return { top: 0 };
  },
});

export default router;

/** Route to the right detail page for any Apple Music resource. */
export function routeForResource(item: MusicKit.MediaItem): { name: string; params: any; query?: any } | null {
  const type = item.type ?? "";
  const library = type.startsWith("library-");
  const query = library ? { library: "1" } : undefined;
  if (type.includes("album")) return { name: "album", params: { id: item.id }, query };
  if (type.includes("playlist")) return { name: "playlist", params: { id: item.id }, query };
  if (type.includes("artist")) {
    // Library artists need their catalog id for the full artist page.
    const catalogId = item.attributes?.playParams?.catalogId ?? item.id;
    return { name: "artist", params: { id: catalogId } };
  }
  return null;
}
