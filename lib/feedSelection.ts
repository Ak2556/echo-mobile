/**
 * Constrained selection for the personalized feed.
 *
 * Diversity is enforced here rather than hoped for: without a per-author cap a
 * single prolific author can own the whole page, and without an exploration
 * reserve the ranker only ever shows what it already believes, which is how a
 * feed stops surprising anyone and quietly stops being worth opening.
 */

export interface SelectableItem {
  id: string;
  authorId: string;
  score: number;
  source: 'follow' | 'semantic' | 'trending' | 'exploration';
}

export interface DiversityOptions {
  limit: number;
  perAuthorCap: number;
  /** Fraction of the page reserved for exploration items, 0..1. */
  explorationShare: number;
}

export function applyDiversity<T extends SelectableItem>(
  items: T[],
  opts: DiversityOptions,
): T[] {
  const { limit, perAuthorCap, explorationShare } = opts;
  if (limit <= 0 || items.length === 0) return [];

  // Clamp so a caller cannot break the one hard invariant (never exceed limit):
  // a negative share would make mainSlots larger than limit.
  const share = Math.min(1, Math.max(0, explorationShare));
  const cap = Math.max(0, perAuthorCap);

  const byScore = [...items].sort((a, b) => b.score - a.score);
  // Floors to 0 when limit < 1/share (e.g. limit 3 at share 0.2): small pages
  // get no exploration slot, which is intended — a 3-item page cannot afford one.
  const exploreSlots = Math.floor(limit * share);
  const mainSlots = limit - exploreSlots;

  const perAuthor = new Map<string, number>();
  const chosen: T[] = [];
  const taken = new Set<string>();

  const tryTake = (item: T): boolean => {
    if (taken.has(item.id)) return false;
    const used = perAuthor.get(item.authorId) ?? 0;
    if (used >= cap) return false;
    perAuthor.set(item.authorId, used + 1);
    taken.add(item.id);
    chosen.push(item);
    return true;
  };

  // Main slots: best scoring items that respect the author cap.
  for (const item of byScore) {
    if (chosen.length >= mainSlots) break;
    tryTake(item);
  }

  // Reserved slots: exploration first, then anything left over. When the main
  // pass underfills because of the author cap, exploration items are preferred
  // for the leftover capacity even at explorationShare 0 — deliberate: a full
  // page beats a short one.
  for (const item of byScore.filter(i => i.source === 'exploration')) {
    if (chosen.length >= limit) break;
    tryTake(item);
  }
  for (const item of byScore) {
    if (chosen.length >= limit) break;
    tryTake(item);
  }

  return chosen;
}
