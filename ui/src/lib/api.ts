/**
 * Typed-ish wrappers around the Apple Music API (through MusicKit's
 * authenticated fetch). Every function returns plain resource arrays the
 * views can render directly.
 */

import { mk, storefront } from "./musickit";

export type Resource = MusicKit.MediaItem;

async function music(path: string, params?: Record<string, any>): Promise<any> {
  const res = await mk().api.music(path, params);
  return res?.data;
}

function items(payload: any): Resource[] {
  return payload?.data ?? [];
}

/* ------------------------------------------------------------------ */
/* Listen Now / personal                                               */
/* ------------------------------------------------------------------ */

export interface RecommendationRow {
  id: string;
  title: string;
  items: Resource[];
}

export async function getRecommendations(): Promise<RecommendationRow[]> {
  const payload = await music(`/v1/me/recommendations`, {
    "art[url]": "f",
    extend: "editorialArtwork",
    limit: 12,
  });
  const rows: RecommendationRow[] = [];
  for (const rec of items(payload)) {
    const title = rec.attributes?.title?.stringForDisplay ?? rec.attributes?.reason?.stringForDisplay ?? "";
    const contents: Resource[] = rec.relationships?.contents?.data ?? [];
    if (contents.length > 0) rows.push({ id: rec.id, title, items: contents });
  }
  return rows;
}

export async function getRecentlyPlayed(): Promise<Resource[]> {
  const payload = await music(`/v1/me/recent/played`, { limit: 30, "art[url]": "f" });
  return items(payload);
}

export async function getHeavyRotation(): Promise<Resource[]> {
  const payload = await music(`/v1/me/history/heavy-rotation`, { limit: 20 });
  return items(payload);
}

export async function getRecentStations(): Promise<Resource[]> {
  const payload = await music(`/v1/me/recent/radio-stations`, { limit: 12 });
  return items(payload);
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export interface Charts {
  songs: Resource[];
  albums: Resource[];
  playlists: Resource[];
}

export async function getCharts(): Promise<Charts> {
  const payload = await music(`/v1/catalog/${storefront()}/charts`, {
    types: "songs,albums,playlists",
    limit: 24,
  });
  return {
    songs: payload?.results?.songs?.[0]?.data ?? [],
    albums: payload?.results?.albums?.[0]?.data ?? [],
    playlists: payload?.results?.playlists?.[0]?.data ?? [],
  };
}

export async function getLiveStations(): Promise<Resource[]> {
  const payload = await music(`/v1/catalog/${storefront()}/stations`, {
    "filter[featured]": "apple-music-live-radio",
  });
  return items(payload);
}

export async function getAlbum(id: string, library = false): Promise<Resource | null> {
  const path = library
    ? `/v1/me/library/albums/${id}`
    : `/v1/catalog/${storefront()}/albums/${id}`;
  const payload = await music(path, { include: "tracks", "art[url]": "f" });
  return items(payload)[0] ?? null;
}

export async function getPlaylist(id: string, library = false): Promise<Resource | null> {
  const path = library
    ? `/v1/me/library/playlists/${id}`
    : `/v1/catalog/${storefront()}/playlists/${id}`;
  const payload = await music(path, { include: "tracks", "art[url]": "f" });
  return items(payload)[0] ?? null;
}

/** Playlist tracks paginate past 100; fetch the rest. */
export async function getAllPlaylistTracks(id: string, library = false): Promise<Resource[]> {
  const base = library
    ? `/v1/me/library/playlists/${id}/tracks`
    : `/v1/catalog/${storefront()}/playlists/${id}/tracks`;
  const tracks: Resource[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    try {
      const payload = await music(base, { limit: 100, offset });
      const batch = items(payload);
      tracks.push(...batch);
      if (!payload?.next || batch.length === 0) break;
      offset += batch.length;
    } catch {
      break;
    }
  }
  return tracks;
}

export interface ArtistPage {
  artist: Resource | null;
  topSongs: Resource[];
  albums: Resource[];
  latestRelease: Resource[];
  similar: Resource[];
}

export async function getArtist(id: string): Promise<ArtistPage> {
  const payload = await music(`/v1/catalog/${storefront()}/artists/${id}`, {
    views: "top-songs,full-albums,latest-release,similar-artists",
    extend: "editorialArtwork,artistBio",
    "art[url]": "f",
  });
  const artist = items(payload)[0] ?? null;
  const views = (artist as any)?.views ?? {};
  return {
    artist,
    topSongs: views["top-songs"]?.data ?? [],
    albums: views["full-albums"]?.data ?? [],
    latestRelease: views["latest-release"]?.data ?? [],
    similar: views["similar-artists"]?.data ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResults {
  songs: Resource[];
  albums: Resource[];
  artists: Resource[];
  playlists: Resource[];
  stations: Resource[];
}

export async function search(term: string): Promise<SearchResults> {
  const payload = await music(`/v1/catalog/${storefront()}/search`, {
    term,
    types: "songs,albums,artists,playlists,stations",
    limit: 25,
    "art[url]": "f",
  });
  const results = payload?.results ?? {};
  return {
    songs: results.songs?.data ?? [],
    albums: results.albums?.data ?? [],
    artists: results.artists?.data ?? [],
    playlists: results.playlists?.data ?? [],
    stations: results.stations?.data ?? [],
  };
}

export async function searchSuggestions(term: string): Promise<Resource[]> {
  const payload = await music(`/v1/catalog/${storefront()}/search/suggestions`, {
    term,
    kinds: "topResults",
    types: "songs,albums,artists,playlists",
    limit: 10,
  });
  return (payload?.results?.suggestions ?? [])
    .map((s: any) => s.content)
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export async function getLibrary(
  kind: "albums" | "playlists" | "songs" | "artists" | "recently-added",
  offset = 0,
  limit = 50
): Promise<{ items: Resource[]; hasMore: boolean }> {
  const payload = await music(`/v1/me/library/${kind}`, {
    limit,
    offset,
    "art[url]": "f",
    include: kind === "songs" ? "catalog" : undefined,
  });
  const batch = items(payload);
  return { items: batch, hasMore: Boolean(payload?.next) };
}

export async function addToLibrary(type: string, id: string): Promise<void> {
  // POST /v1/me/library?ids[albums]=... — MusicKit exposes fetchOptions via api.music
  await mk().api.music(
    `/v1/me/library`,
    { [`ids[${type}]`]: id },
    { fetchOptions: { method: "POST" } }
  );
}

/* ------------------------------------------------------------------ */
/* Ratings (love / dislike)                                            */
/* ------------------------------------------------------------------ */

export async function loveSong(id: string, love = true): Promise<void> {
  await mk().api.music(
    `/v1/me/ratings/songs/${id}`,
    {},
    {
      fetchOptions: {
        method: "PUT",
        body: JSON.stringify({
          type: "rating",
          attributes: { value: love ? 1 : -1 },
        }),
      },
    }
  );
}

export async function unloveSong(id: string): Promise<void> {
  await mk().api.music(
    `/v1/me/ratings/songs/${id}`,
    {},
    { fetchOptions: { method: "DELETE" } }
  );
}

export async function getSongRating(id: string): Promise<number> {
  try {
    const payload = await music(`/v1/me/ratings/songs`, { ids: id });
    return payload?.data?.[0]?.attributes?.value ?? 0;
  } catch {
    return 0;
  }
}
