/**
 * Time-synced lyrics via the Apple Music API.
 *
 * Apple returns TTML; we parse it into timed lines. Songs without sync
 * markers still render as static lyrics.
 */

import { mk, storefront } from "./musickit";

export interface LyricLine {
  /** seconds; -1 when the song has no timing info */
  begin: number;
  end: number;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  synced: boolean;
  /** e.g. "Musixmatch" — displayed as attribution when present */
  provider?: string;
}

function parseClock(value: string | null): number {
  if (!value) return -1;
  // TTML clock: "ss.fff", "mm:ss.fff" or "hh:mm:ss.fff"
  const parts = value.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return -1;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}

export function parseTtml(ttml: string): Lyrics {
  const doc = new DOMParser().parseFromString(ttml, "text/xml");
  const paragraphs = Array.from(doc.querySelectorAll("p"));
  const lines: LyricLine[] = [];
  let synced = false;

  for (const p of paragraphs) {
    const begin = parseClock(p.getAttribute("begin"));
    const end = parseClock(p.getAttribute("end"));
    // Word-level karaoke TTML nests <span begin=...>; textContent flattens it.
    const text = (p.textContent ?? "").trim();
    if (!text) continue;
    if (begin >= 0) synced = true;
    lines.push({ begin, end, text });
  }

  const provider =
    doc.querySelector("songwriter")?.textContent?.trim() || undefined;

  return { lines, synced, provider };
}

const cache = new Map<string, Lyrics | null>();

/**
 * Fetch lyrics for a catalog song. Requires an authorized, subscribed user —
 * returns null (not an error) when lyrics simply aren't available.
 */
export async function fetchLyrics(songId: string | undefined): Promise<Lyrics | null> {
  if (!songId) return null;
  if (cache.has(songId)) return cache.get(songId) ?? null;

  let result: Lyrics | null = null;
  const paths = [
    `/v1/catalog/${storefront()}/songs/${songId}/syllable-lyrics`,
    `/v1/catalog/${storefront()}/songs/${songId}/lyrics`,
  ];

  for (const path of paths) {
    try {
      const res = await mk().api.music(path);
      const ttml: string | undefined = res?.data?.data?.[0]?.attributes?.ttml;
      if (ttml) {
        result = parseTtml(ttml);
        if (result.lines.length > 0) break;
        result = null;
      }
    } catch {
      /* 404 / no subscription / unauthorized — try next source */
    }
  }

  cache.set(songId, result);
  return result;
}

/** Binary search for the active line at time `t`. */
export function activeLineIndex(lines: LyricLine[], t: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].begin >= 0 && lines[i].begin <= t) active = i;
    else if (lines[i].begin > t) break;
  }
  return active;
}
