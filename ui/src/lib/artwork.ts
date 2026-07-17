/** Artwork helpers: URL templating and dominant-color extraction. */

export function artworkUrl(
  artwork: MusicKit.Artwork | undefined | null,
  size = 300
): string {
  if (!artwork?.url) return "";
  return artwork.url
    .replace("{w}", String(size))
    .replace("{h}", String(size))
    .replace("{f}", "webp");
}

export interface Accent {
  /** CSS color usable as the UI accent. */
  color: string;
  /** Darker companion for gradients. */
  deep: string;
  /** rgb triplet, e.g. "250, 88, 106" for alpha composition. */
  rgb: string;
}

export const DEFAULT_ACCENT: Accent = {
  color: "rgb(250, 88, 106)",
  deep: "rgb(125, 44, 53)",
  rgb: "250, 88, 106",
};

/**
 * Extract a vibrant accent color from an artwork image.
 * Downsamples to a small canvas and scores pixels by saturation × brightness
 * sweet spot, so we pick something lively rather than the average mud.
 */
export async function extractAccent(imageUrl: string): Promise<Accent> {
  if (!imageUrl) return DEFAULT_ACCENT;
  try {
    const img = await loadImage(imageUrl);
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return DEFAULT_ACCENT;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let best = { score: -1, r: 250, g: 88, b: 106 };
    const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lightness = (max + min) / 510;
      const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      // favor saturated colors of medium lightness
      const score = sat * (1 - Math.abs(lightness - 0.55) * 1.6);
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 };
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1;
      bucket.score += score;
      buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
      if (bucket.score > best.score) {
        best = {
          score: bucket.score,
          r: Math.round(bucket.r / bucket.n),
          g: Math.round(bucket.g / bucket.n),
          b: Math.round(bucket.b / bucket.n),
        };
      }
    }

    // Lift very dark accents so text/controls stay visible on dark surfaces.
    let { r, g, b } = best;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < 60) {
      const lift = 60 / Math.max(luma, 1);
      r = Math.min(255, Math.round(r * lift));
      g = Math.min(255, Math.round(g * lift));
      b = Math.min(255, Math.round(b * lift));
    }

    return {
      color: `rgb(${r}, ${g}, ${b})`,
      deep: `rgb(${Math.round(r * 0.35)}, ${Math.round(g * 0.35)}, ${Math.round(b * 0.35)})`,
      rgb: `${r}, ${g}, ${b}`,
    };
  } catch {
    return DEFAULT_ACCENT;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("artwork failed to load"));
    img.src = url;
  });
}
