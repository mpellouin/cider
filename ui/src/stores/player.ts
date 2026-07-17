/**
 * The player store — single source of truth for playback state, queue,
 * accent color and lyrics. It mirrors MusicKit's events into reactive
 * state the entire UI renders from.
 */

import { defineStore } from "pinia";
import { artworkUrl, extractAccent, DEFAULT_ACCENT, type Accent } from "@/lib/artwork";
import { fetchLyrics, activeLineIndex, type Lyrics } from "@/lib/lyrics";
import { mk, mkReady, getDrmStatus, type DrmStatus } from "@/lib/musickit";
import { getSongRating, loveSong, unloveSong } from "@/lib/api";
import { useStats } from "./stats";
import { useSettings } from "./settings";

export interface NowPlaying {
  id: string;
  catalogId: string;
  title: string;
  artist: string;
  album: string;
  artworkSmall: string;
  artworkLarge: string;
  durationMs: number;
  url?: string;
}

export interface QueueEntry {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  durationMs: number;
  index: number;
}

interface PlayerState {
  ready: boolean;
  bootError: string;
  authorized: boolean;
  drm: DrmStatus;

  nowPlaying: NowPlaying | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeatMode: number; // 0 none, 1 one, 2 all
  shuffleMode: number; // 0 off, 1 songs

  queue: QueueEntry[];
  queuePosition: number;

  accent: Accent;
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
  activeLyricLine: number;
  loved: boolean;

  showNowPlaying: boolean;
  showQueue: boolean;
  showPalette: boolean;
}

let lastTimeTick = -1;

export const usePlayer = defineStore("player", {
  state: (): PlayerState => ({
    ready: false,
    bootError: "",
    authorized: false,
    drm: "unknown",

    nowPlaying: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    volume: 0.75,
    repeatMode: 0,
    shuffleMode: 0,

    queue: [],
    queuePosition: -1,

    accent: DEFAULT_ACCENT,
    lyrics: null,
    lyricsLoading: false,
    activeLyricLine: -1,
    loved: false,

    showNowPlaying: false,
    showQueue: false,
    showPalette: false,
  }),

  getters: {
    progress(state): number {
      if (!state.duration) return 0;
      return Math.min(1, state.currentTime / state.duration);
    },
    hasSyncedLyrics(state): boolean {
      return Boolean(state.lyrics?.synced);
    },
  },

  actions: {
    /* ---------------------------------------------------------- */
    /* bootstrap                                                    */
    /* ---------------------------------------------------------- */

    attach() {
      const music = mk();
      this.ready = true;
      this.authorized = music.isAuthorized;
      this.drm = getDrmStatus();

      const settings = useSettings();
      this.volume = settings.volume;
      try {
        music.volume = settings.volume;
      } catch { /* volume not writable until first play on some platforms */ }

      music.addEventListener("authorizationStatusDidChange", () => {
        this.authorized = mk().isAuthorized;
      });

      music.addEventListener("playbackStateDidChange", ({ state }: any) => {
        const S = window.MusicKit.PlaybackStates;
        this.isPlaying = state === S.playing;
        this.isBuffering = state === S.loading || state === S.waiting || state === S.stalled;
      });

      music.addEventListener("nowPlayingItemDidChange", ({ item }: any) => {
        this.onTrackChange(item ?? null);
      });

      music.addEventListener("playbackTimeDidChange", ({ currentPlaybackTime }: any) => {
        this.onTimeTick(currentPlaybackTime ?? 0);
      });

      music.addEventListener("playbackDurationDidChange", () => {
        this.duration = mk().currentPlaybackDuration || this.duration;
      });

      music.addEventListener("queueItemsDidChange", () => this.syncQueue());
      music.addEventListener("queuePositionDidChange", () => this.syncQueue());

      music.addEventListener("playbackVolumeDidChange", () => {
        this.volume = mk().volume;
      });
    },

    /* ---------------------------------------------------------- */
    /* event handlers                                               */
    /* ---------------------------------------------------------- */

    async onTrackChange(item: MusicKit.MediaItem | null) {
      lastTimeTick = -1;
      this.activeLyricLine = -1;

      if (!item) {
        this.nowPlaying = null;
        this.lyrics = null;
        this.loved = false;
        return;
      }

      const attrs = item.attributes ?? ({} as MusicKit.MediaItemAttributes);
      const catalogId = attrs.playParams?.catalogId ?? item.id;
      const np: NowPlaying = {
        id: item.id,
        catalogId,
        title: attrs.name ?? "Unknown",
        artist: attrs.artistName ?? "",
        album: attrs.albumName ?? "",
        artworkSmall: artworkUrl(attrs.artwork, 120),
        artworkLarge: artworkUrl(attrs.artwork, 1000),
        durationMs: attrs.durationInMillis ?? 0,
        url: attrs.url,
      };
      this.nowPlaying = np;
      this.duration = (attrs.durationInMillis ?? 0) / 1000;
      this.currentTime = 0;

      useStats().notePlay({
        id: catalogId,
        title: np.title,
        artist: np.artist,
        artworkUrl: np.artworkSmall,
      });

      this.syncQueue();

      // Dynamic accent from the artwork.
      const settings = useSettings();
      if (settings.dynamicAccent && np.artworkSmall) {
        extractAccent(artworkUrl(attrs.artwork, 64)).then((accent) => {
          // Only apply if this track is still current.
          if (this.nowPlaying?.id === np.id) this.setAccent(accent);
        });
      }

      // Lyrics.
      this.lyrics = null;
      this.lyricsLoading = true;
      fetchLyrics(catalogId)
        .then((lyrics) => {
          if (this.nowPlaying?.id === np.id) this.lyrics = lyrics;
        })
        .finally(() => {
          if (this.nowPlaying?.id === np.id) this.lyricsLoading = false;
        });

      // Loved state.
      this.loved = false;
      getSongRating(catalogId).then((value) => {
        if (this.nowPlaying?.id === np.id) this.loved = value === 1;
      });
    },

    onTimeTick(time: number) {
      this.currentTime = time;
      if (!this.duration && mkReady()) {
        this.duration = mk().currentPlaybackDuration || 0;
      }

      // Accumulate listening stats using tick deltas (ticks are ~1/s).
      if (lastTimeTick >= 0 && this.nowPlaying) {
        const delta = time - lastTimeTick;
        if (delta > 0 && delta <= 3) {
          useStats().noteListened(this.nowPlaying.catalogId, this.nowPlaying.artist, delta);
        }
      }
      lastTimeTick = time;

      // Track the active synced-lyric line.
      if (this.lyrics?.synced) {
        const idx = activeLineIndex(this.lyrics.lines, time + 0.35);
        if (idx !== this.activeLyricLine) this.activeLyricLine = idx;
      }
    },

    syncQueue() {
      if (!mkReady()) return;
      const q = mk().queue;
      if (!q) return;
      this.queuePosition = q.position ?? -1;
      this.queue = (q.items ?? []).map((item, index) => ({
        id: `${index}-${item.id}`,
        title: item.attributes?.name ?? "Unknown",
        artist: item.attributes?.artistName ?? "",
        artworkUrl: artworkUrl(item.attributes?.artwork, 96),
        durationMs: item.attributes?.durationInMillis ?? 0,
        index,
      }));
    },

    setAccent(accent: Accent) {
      this.accent = accent;
      const root = document.documentElement;
      root.style.setProperty("--accent", accent.color);
      root.style.setProperty("--accent-deep", accent.deep);
      root.style.setProperty("--accent-rgb", accent.rgb);
    },

    /* ---------------------------------------------------------- */
    /* transport controls                                           */
    /* ---------------------------------------------------------- */

    async togglePlay() {
      if (!mkReady()) return;
      try {
        if (this.isPlaying) await mk().pause();
        else await mk().play();
      } catch (err) {
        console.warn("[cider] play/pause failed:", err);
      }
    },

    async next() {
      if (!mkReady()) return;
      try { await mk().skipToNextItem(); } catch { /* end of queue */ }
    },

    async previous() {
      if (!mkReady()) return;
      try {
        if (this.currentTime > 5) await mk().seekToTime(0);
        else await mk().skipToPreviousItem();
      } catch { /* start of queue */ }
    },

    async seekTo(seconds: number) {
      if (!mkReady()) return;
      try {
        await mk().seekToTime(Math.max(0, Math.min(seconds, this.duration)));
      } catch { /* not seekable right now */ }
    },

    setVolume(value: number) {
      const clamped = Math.max(0, Math.min(1, value));
      this.volume = clamped;
      if (mkReady()) {
        try { mk().volume = clamped; } catch { /* ignore */ }
      }
      const settings = useSettings();
      settings.set("volume", clamped);
    },

    cycleRepeat() {
      if (!mkReady()) return;
      const next = (this.repeatMode + 1) % 3;
      try {
        (mk() as any).repeatMode = next;
        this.repeatMode = next;
      } catch { /* ignore */ }
    },

    toggleShuffle() {
      if (!mkReady()) return;
      const next = this.shuffleMode === 0 ? 1 : 0;
      try {
        (mk() as any).shuffleMode = next;
        this.shuffleMode = next;
      } catch { /* ignore */ }
    },

    async toggleLove() {
      if (!this.nowPlaying) return;
      const id = this.nowPlaying.catalogId;
      const target = !this.loved;
      this.loved = target; // optimistic
      try {
        if (target) await loveSong(id);
        else await unloveSong(id);
      } catch {
        this.loved = !target;
      }
    },

    /* ---------------------------------------------------------- */
    /* queueing                                                     */
    /* ---------------------------------------------------------- */

    /** Play any Apple Music resource (song, album, playlist, station…). */
    async playResource(resource: MusicKit.MediaItem, startWith = 0) {
      if (!mkReady()) return;
      const music = mk();
      const playParams = resource.attributes?.playParams;

      try {
        if (playParams?.kind && playParams?.id) {
          await music.setQueue({ ...playParams, startWith, startPlaying: true });
        } else {
          const map: Record<string, string> = {
            songs: "song",
            albums: "album",
            playlists: "playlist",
            stations: "station",
            "library-albums": "album",
            "library-playlists": "playlist",
            "library-songs": "song",
            "music-videos": "musicVideo",
          };
          const kind = map[resource.type];
          if (!kind) throw new Error(`unplayable resource type: ${resource.type}`);
          await music.setQueue({ [kind]: resource.id, startWith, startPlaying: true });
        }
        await music.play();
      } catch (err) {
        console.error("[cider] failed to play resource:", err);
      }
    },

    /** Play a list of song resources starting at `index` (track lists). */
    async playSongs(songs: MusicKit.MediaItem[], index = 0) {
      if (!mkReady() || songs.length === 0) return;
      const music = mk();
      try {
        const ids = songs.map((s) => s.attributes?.playParams?.id ?? s.id);
        await music.setQueue({ songs: ids, startWith: index, startPlaying: true });
        await music.play();
      } catch (err) {
        console.error("[cider] failed to queue songs:", err);
      }
    },

    async queueNext(resource: MusicKit.MediaItem) {
      if (!mkReady()) return;
      const playParams = resource.attributes?.playParams;
      try {
        await mk().playNext(playParams?.id ? { ...playParams } : { song: resource.id });
        this.syncQueue();
      } catch (err) {
        console.warn("[cider] queueNext failed:", err);
      }
    },

    async queueLater(resource: MusicKit.MediaItem) {
      if (!mkReady()) return;
      const playParams = resource.attributes?.playParams;
      try {
        await mk().playLater(playParams?.id ? { ...playParams } : { song: resource.id });
        this.syncQueue();
      } catch (err) {
        console.warn("[cider] queueLater failed:", err);
      }
    },

    async jumpToQueueIndex(index: number) {
      if (!mkReady()) return;
      try {
        await mk().changeToMediaAtIndex(index);
      } catch (err) {
        console.warn("[cider] jump failed:", err);
      }
    },

    /* ---------------------------------------------------------- */
    /* auth                                                         */
    /* ---------------------------------------------------------- */

    async authorize() {
      if (!mkReady()) return;
      try {
        await mk().authorize();
        this.authorized = mk().isAuthorized;
      } catch (err) {
        console.warn("[cider] authorize failed or was cancelled:", err);
        this.authorized = mk().isAuthorized;
      }
    },

    async unauthorize() {
      if (!mkReady()) return;
      try {
        await mk().unauthorize();
      } finally {
        this.authorized = mk().isAuthorized;
      }
    },
  },
});
