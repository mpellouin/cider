/**
 * Local listening statistics — a Cider-only feature.
 *
 * Playback seconds are accumulated per-day, per-song and per-artist in
 * localStorage. The Stats page combines this with Apple's heavy-rotation
 * and recently-played endpoints for a private "Replay, but live" view.
 */

import { defineStore } from "pinia";

export interface TrackStat {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string;
  plays: number;
  seconds: number;
  lastPlayed: number;
}

interface StatsState {
  /** ISO day → seconds listened */
  daily: Record<string, number>;
  tracks: Record<string, TrackStat>;
  artists: Record<string, { name: string; seconds: number; plays: number }>;
  totalSeconds: number;
}

const STORAGE_KEY = "cider.stats.v1";
const MAX_TRACKS = 500;

function load(): StatsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted stats are not worth crashing over */
  }
  return { daily: {}, tracks: {}, artists: {}, totalSeconds: 0 };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useStats = defineStore("stats", {
  state: (): StatsState => load(),

  getters: {
    topTracks(state): TrackStat[] {
      return Object.values(state.tracks)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 25);
    },
    topArtists(state) {
      return Object.entries(state.artists)
        .map(([name, v]) => ({ ...v, name }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 15);
    },
    minutesToday(state): number {
      return (state.daily[today()] ?? 0) / 60;
    },
    minutesThisWeek(state): number {
      let total = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        total += state.daily[d.toISOString().slice(0, 10)] ?? 0;
      }
      return total / 60;
    },
    /** last 14 days, oldest first, minutes per day */
    dailySeries(state): { day: string; minutes: number }[] {
      const series: { day: string; minutes: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        series.push({
          day: d.toLocaleDateString(undefined, { weekday: "short" }),
          minutes: Math.round((state.daily[key] ?? 0) / 60),
        });
      }
      return series;
    },
  },

  actions: {
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
      } catch {
        /* quota exceeded — drop oldest tracks and retry once */
        this.prune(Math.floor(MAX_TRACKS / 2));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
        } catch { /* give up quietly */ }
      }
    },

    prune(keep = MAX_TRACKS) {
      const sorted = Object.values(this.tracks).sort((a, b) => b.lastPlayed - a.lastPlayed);
      if (sorted.length <= keep) return;
      const surviving: Record<string, TrackStat> = {};
      for (const t of sorted.slice(0, keep)) surviving[t.id] = t;
      this.tracks = surviving;
    },

    notePlay(track: { id: string; title: string; artist: string; artworkUrl: string }) {
      if (!track.id) return;
      const existing = this.tracks[track.id];
      if (existing) {
        existing.plays += 1;
        existing.lastPlayed = Date.now();
        existing.artworkUrl = track.artworkUrl || existing.artworkUrl;
      } else {
        this.tracks[track.id] = {
          ...track,
          plays: 1,
          seconds: 0,
          lastPlayed: Date.now(),
        };
        this.prune();
      }
      if (track.artist) {
        const artist = this.artists[track.artist] ?? { name: track.artist, seconds: 0, plays: 0 };
        artist.plays += 1;
        this.artists[track.artist] = artist;
      }
      this.persist();
    },

    noteListened(trackId: string, artist: string, seconds: number) {
      if (seconds <= 0 || seconds > 30) return; // ignore seeks/glitches
      this.daily[today()] = (this.daily[today()] ?? 0) + seconds;
      this.totalSeconds += seconds;
      const track = this.tracks[trackId];
      if (track) track.seconds += seconds;
      if (artist && this.artists[artist]) this.artists[artist].seconds += seconds;
      // persist at most ~every 15 seconds of listening to spare the disk
      pendingSeconds += seconds;
      if (pendingSeconds >= 15) {
        pendingSeconds = 0;
        this.persist();
      }
    },
  },
});

let pendingSeconds = 0;
