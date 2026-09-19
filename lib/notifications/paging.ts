import type { Notification } from '../../types';

/**
 * How many notifications a page holds.
 *
 * The list used to be a single `.limit(50)` with no way to ask for more, so the
 * fifty-first notification and everything older than it did not exist as far as
 * the app was concerned — there was no empty state for it and no control to
 * reveal it, the history simply stopped.
 *
 * Smaller than that old cap on purpose. A page is now a scroll trigger rather
 * than the whole history, and each one costs a profile lookup and an echo
 * lookup for its rows, so fetching fewer per round-trip gets the first screen
 * up sooner on the connections this launches into.
 */
export const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * The offset to request next, or undefined when the list is exhausted.
 *
 * A short page means the server had nothing more to give, which is the only
 * reliable end signal here: counting is a second query and the total moves
 * under us as notifications arrive.
 *
 * Derived from what is actually held rather than from a page counter, so a
 * page that came back trimmed — by a dismissal landing mid-scroll, say — does
 * not leave the next offset pointing past the rows it skipped.
 */
export function nextNotificationOffset(
  lastPage: Notification[] | undefined,
  allPages: Notification[][] | undefined,
): number | undefined {
  // Defensive because this runs against restored cache. The persisted entry
  // survives an app upgrade, so a build that changes the cache shape can hand
  // this a page that is not one — and throwing here takes the whole screen into
  // the error boundary rather than degrading. NOTIFICATIONS_QUERY_KEY moving is
  // what actually prevents that; this is the floor under it.
  if (!lastPage || lastPage.length < NOTIFICATIONS_PAGE_SIZE) return undefined;
  return (allPages ?? []).reduce((n, page) => n + page.length, 0);
}

/**
 * The cache key, versioned.
 *
 * Bumped when this screen moved from useQuery to useInfiniteQuery. The query
 * cache is persisted to MMKV for seven days with no buster, so the old flat
 * Notification[] was being restored into a hook that expected
 * { pages, pageParams } — TanStack read data.pages, got undefined, and the
 * screen crashed on first open after the update. A stale entry under the old
 * key is now simply never read.
 *
 * Change this whenever the shape of a notifications page changes.
 */
export const NOTIFICATIONS_QUERY_KEY = ['notifications', 'v2'] as const;
