import { WARM_AVATAR_COLORS } from '../../../../lib/avatarPalette';

/**
 * The colour a media tile shows while its image is still arriving.
 *
 * Grey is the default and it is the wrong answer here: on the connections this
 * app is launching into, the placeholder is what most people look at for the
 * first second of every card, so it may as well belong to the app.
 *
 * Not a blurhash. expo-image's `placeholder` wants a blurhash or an image
 * source, and there are no server-side hashes for this media — inventing a
 * constant one would mean shipping a base83 string nobody can verify, and the
 * same blur under every photo. A tint costs nothing, cannot be malformed, and
 * the `transition` on the image fades it out on decode.
 *
 * Derived from the URI so a four-tile grid is four different colours rather
 * than one flat block, and so the same photo keeps its colour between renders —
 * a tint that changed on re-render would flicker on every recycle.
 */
export function mediaPlaceholderTint(uri: string): string {
  const palette = WARM_AVATAR_COLORS;
  if (!uri) return palette[0];

  // FNV-1a. Any stable hash would do; this one is short and has no collisions
  // worth worrying about across the handful of images in a single card.
  let h = 0x811c9dc5;
  for (let i = 0; i < uri.length; i++) {
    h ^= uri.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return palette[Math.abs(h) % palette.length];
}

/**
 * How long the fade from tint to image runs, in ms.
 *
 * Short enough not to feel like a delay on a cached image, long enough to read
 * as a fade rather than a pop on a cold one.
 */
export const MEDIA_FADE_MS = 180;
