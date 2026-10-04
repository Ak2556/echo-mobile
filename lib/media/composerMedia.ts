/**
 * Preview shape for a photo or video in the composer: the media's own aspect,
 * clamped to the 4:5 (portrait) … 1.91:1 (landscape) range. A single photo used
 * to be forced into 16:9, so a portrait phone photo showed as a cropped strip
 * of its middle and nobody could see what they were about to post.
 */
export function composerMediaAspect(width?: number | null, height?: number | null): number {
  if (!width || !height) return 4 / 5;
  return Math.min(1.91, Math.max(4 / 5, width / height));
}

/** "0:05", "1:12" — from expo-image-picker's duration, which is milliseconds. */
export function formatClipDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Tags as they will be posted: split on spaces or commas, leading # dropped, de-duplicated. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,]+/)) {
    const tag = part.replace(/^#+/, '').trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Touch position on a scrub bar as 0…1, clamped — a drag can leave the bar. */
export function scrubFraction(x: number, width: number): number {
  if (!width || width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width));
}
