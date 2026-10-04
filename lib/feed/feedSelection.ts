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

export interface DiversitySelection<T> {
  /** The items that survived the author cap and the exploration reserve. */
  items: T[];
  /**
   * The deepest item the selector looked at in score order — NOT the last item
   * it kept. The keyset cursor for the next page has to be taken from here:
   * rows rejected by the author cap scored ABOVE the last kept row, so a cursor
   * built from the kept set re-fetches them on every later page, where they are
   * rejected again. They stay unreachable either way, but a cursor taken from
   * the examined set stops them from eating the next page's capacity forever.
   * Null only when nothing was examined (empty input or a non-positive limit).
   */
  lastExamined: T | null;
  /** How far down the score-ordered list the page consumed, 1-based. */
  examinedCount: number;
}

/**
 * Diversity selection, reporting how deep into the score-ordered candidates it
 * had to reach. `applyDiversity` is this function's `items` — the pagination
 * caller wants `lastExamined` as well.
 */
export function selectWithDiversity<T extends SelectableItem>(
  items: T[],
  opts: DiversityOptions,
): DiversitySelection<T> {
  const { limit, perAuthorCap, explorationShare } = opts;
  if (limit <= 0 || items.length === 0) {
    return { items: [], lastExamined: null, examinedCount: 0 };
  }

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
  // Furthest index in `byScore` this selection actually inspected, across all
  // three passes. Everything at or above it has been decided; everything below
  // it was never looked at and is what the next page must start from.
  let deepest = -1;

  const tryTake = (item: T, index: number): boolean => {
    if (index > deepest) deepest = index;
    if (taken.has(item.id)) return false;
    const used = perAuthor.get(item.authorId) ?? 0;
    if (used >= cap) return false;
    perAuthor.set(item.authorId, used + 1);
    taken.add(item.id);
    chosen.push(item);
    return true;
  };

  // Main slots: best scoring items that respect the author cap.
  for (let i = 0; i < byScore.length; i++) {
    if (chosen.length >= mainSlots) break;
    tryTake(byScore[i], i);
  }

  // Reserved slots: exploration first, then anything left over. When the main
  // pass underfills because of the author cap, exploration items are preferred
  // for the leftover capacity even at explorationShare 0 — deliberate: a full
  // page beats a short one.
  for (let i = 0; i < byScore.length; i++) {
    if (chosen.length >= limit) break;
    if (byScore[i].source !== 'exploration') continue;
    tryTake(byScore[i], i);
  }
  for (let i = 0; i < byScore.length; i++) {
    if (chosen.length >= limit) break;
    tryTake(byScore[i], i);
  }

  return {
    items: chosen,
    lastExamined: deepest >= 0 ? byScore[deepest] : null,
    examinedCount: deepest + 1,
  };
}

/** Back-compatible wrapper: the selected page, without the cursor bookkeeping. */
export function applyDiversity<T extends SelectableItem>(
  items: T[],
  opts: DiversityOptions,
): T[] {
  return selectWithDiversity(items, opts).items;
}
