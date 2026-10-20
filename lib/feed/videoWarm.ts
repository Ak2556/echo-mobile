/**
 * Which Reverb cards should already hold a loaded player before the viewer reaches them.
 *
 * Only the card on screen used to hold a player, so every swipe built the next one from
 * scratch: open the connection, start the decoder, draw a first frame, all after the viewer had
 * landed. Warming the neighbours moves that work to before the swipe. A warm card loads and
 * stays paused and muted on its first frame; becoming active only has to press play.
 *
 * The next card is always warmed (it is where the viewer is going). The previous one is warmed
 * too, for the scroll-back correction, except on a low-tier device, where a second idle decoder
 * costs more than the instant scroll-back is worth.
 */
export type WarmTier = 'high' | 'mid' | 'low';

export function warmIdsAround(ids: readonly string[], activeIndex: number, tier: WarmTier = 'mid'): string[] {
  if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= ids.length) return [];
  const warm: string[] = [];
  const next = ids[activeIndex + 1];
  if (next) warm.push(next);
  const previous = ids[activeIndex - 1];
  if (previous && tier !== 'low') warm.push(previous);
  return warm;
}

/** The next few cards whose still frame is worth fetching ahead of time (nearest first). */
export function posterPrefetchIds(ids: readonly string[], activeIndex: number, count = 3): string[] {
  if (!Number.isInteger(activeIndex) || activeIndex < 0) return ids.slice(0, count);
  return ids.slice(activeIndex + 1, activeIndex + 1 + count);
}
