// Which uploaded media a vision classifier can actually look at.
//
// Kept free of Deno globals so it can be unit-tested from the main vitest
// suite; the moderation module that uses it cannot be, since it reads
// Deno.env at import.

/** Extensions the vision model accepts as an image_url part. */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?|#|$)/i;

/** Video containers and streaming manifests. A still-image model cannot read these. */
const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|avi|mkv|m3u8)(\?|#|$)/i;

export interface MediaSplit {
  /** URLs to send to the classifier. */
  images: string[];
  /** Video and anything unrecognised — recorded, not classified. */
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
    else if (VIDEO_EXTENSIONS.test(trimmed)) unchecked.push(trimmed);
    // An extensionless URL could be either. Treat it as unchecked rather than
    // guessing: a wrong guess here either fails the whole gate or waves the
    // file through.
    else unchecked.push(trimmed);
  }

  return { images, unchecked };
}
