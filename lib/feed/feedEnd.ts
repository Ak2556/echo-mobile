/**
 * A feed that ends.
 *
 * The page promises "a feed that ends, no infinite scroll", so a visit to Home shows
 * a fixed number of posts and then an end card, instead of loading the next page for as
 * long as there is one. Pulling to refresh starts a new visit.
 */

/** How many posts one visit to Home shows before it ends. */
export const FEED_VISIT_LIMIT = 30;

/** The posts a visit shows. */
export function capFeed<T>(items: readonly T[], limit: number = FEED_VISIT_LIMIT): T[] {
  return items.slice(0, Math.max(0, limit));
}

/** True once the pages fetched so far already hold a full visit, so no more are fetched. */
export function visitCapReached(pages: readonly (readonly unknown[])[], limit: number = FEED_VISIT_LIMIT): boolean {
  let total = 0;
  for (const page of pages) total += page.length;
  return total >= limit;
}

/**
 * The end card shows when there is something to end: a full visit, or a small network
 * with nothing more to load. Never while the first page is still loading (count is 0).
 */
export function feedHasEnded(shown: number, hasNextPage: boolean, limit: number = FEED_VISIT_LIMIT): boolean {
  return shown > 0 && (shown >= limit || !hasNextPage);
}
