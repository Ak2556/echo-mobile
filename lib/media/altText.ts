/**
 * Photo descriptions: the rules in one place, so the composer, the grid, the viewer
 * and the database agree.
 */

/** public_echoes_media_alt_check allows no more than this per description. */
export const ALT_TEXT_MAX = 400;
/** ...and no more descriptions than this per post (a post holds far fewer photos). */
export const ALT_TEXT_MAX_COUNT = 10;

/**
 * What to send with a post: one trimmed description per photo, in the photos'
 * order, or undefined when none was written (so the column stays null and the post
 * is not marked as having descriptions it does not have).
 */
export function altForPublish(images: readonly { alt?: string | null }[]): string[] | undefined {
  const alts = images.slice(0, ALT_TEXT_MAX_COUNT).map(i => (i.alt ?? '').trim().slice(0, ALT_TEXT_MAX));
  return alts.some(Boolean) ? alts : undefined;
}

/**
 * What a screen reader says for photo `index` of `count`: the author's description
 * when there is one, otherwise at least which photo it is.
 */
export function photoLabel(alt: string | null | undefined, index: number, count: number, noun = 'Photo'): string {
  const described = alt?.trim();
  if (described) return described;
  return count > 1 ? `${noun} ${index + 1} / ${count}` : noun;
}
