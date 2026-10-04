// Which uploaded media a vision classifier can actually look at.
//
// Kept free of Deno globals so it can be unit-tested from the main vitest
// suite; the moderation module that uses it cannot be, since it reads
// Deno.env at import.

/** Containers Gemini reads that Echo's clients actually produce. */
const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** MIME type for a video URL, or null when Gemini cannot read it (m3u8, mkv, unknown). */
export function videoMimeType(url: string): string | null {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  if (!m) return null;
  return MIME_BY_EXTENSION[m[1].toLowerCase()] ?? null;
}

/** Extensions the vision model accepts as an image_url part. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?|#|$)/i;

/** Video containers and streaming manifests. A still-image model cannot read these. */
const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(\?|#|$)/i;

export interface MediaSplit {
  /** URLs to send to the image classifier. */
  images: string[];
  /** Video files a video-capable model can read (see videoMimeType). */
  videos: string[];
  /** Everything else (HLS manifests, unrecognised files) — recorded, not classified. */
  unchecked: string[];
}

/**
 * Split uploaded media into what can be classified and what cannot.
 *
 * Post type is not consulted deliberately: a `text` post can carry images too,
 * and 25 of the 41 text posts in production do. The file itself decides.
 */
export function splitMediaForModeration(urls: readonly (string | null | undefined)[] | null | undefined): MediaSplit {
  const images: string[] = [];
  const videos: string[] = [];
  const unchecked: string[] = [];

  for (const url of urls ?? []) {
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (!trimmed) continue;
    // Only http(s) — a data: or file: URL is not something the classifier can
    // fetch, and passing one through would be a silent pass.
    if (!/^https?:\/\//i.test(trimmed)) {
      unchecked.push(trimmed);
      continue;
    }
    if (IMAGE_EXTENSIONS.test(trimmed)) images.push(trimmed);
    else if (videoMimeType(trimmed)) videos.push(trimmed);
    else if (VIDEO_EXTENSIONS.test(trimmed)) unchecked.push(trimmed);
    // An extensionless URL could be either. Treat it as unchecked rather than
    // guessing: a wrong guess here either fails the whole gate or waves the
    // file through.
    else unchecked.push(trimmed);
  }

  return { images, videos, unchecked };
}

export interface HttpSplit {
  /** http(s) URLs a model can fetch. */
  fetchable: string[];
  /** Anything else (data:, file:, garbage). Cannot be judged, so cannot be waved through. */
  unfetchable: string[];
}

/**
 * Split image URLs into what a classifier can fetch and what it cannot. Unlike
 * splitMediaForModeration this does not look at the extension: an avatar from a
 * sign-in provider often has none, and the model decides whether it is an image.
 */
export function splitHttpUrls(urls: readonly (string | null | undefined)[] | null | undefined): HttpSplit {
  const fetchable: string[] = [];
  const unfetchable: string[] = [];
  for (const url of urls ?? []) {
    if (typeof url !== 'string') continue;
    const trimmed = url.trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) fetchable.push(trimmed);
    else unfetchable.push(trimmed);
  }
  return { fetchable, unfetchable };
}
