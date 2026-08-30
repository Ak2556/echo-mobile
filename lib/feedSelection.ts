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

  const byScore = [...items].sort((a, b) => b.score - a.score);
  const exploreSlots = Math.floor(limit * explorationShare);
  const mainSlots = limit - exploreSlots;

  const perAuthor = new Map<string, number>();
  const chosen: T[] = [];
  const taken = new Set<string>();

  const tryTake = (item: T): boolean => {
    if (taken.has(item.id)) return false;
    const used = perAuthor.get(item.authorId) ?? 0;
    if (used >= perAuthorCap) return false;
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

  // Reserved slots: exploration first, then anything left over so a page is
  // never short purely because there was nothing to explore.
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
