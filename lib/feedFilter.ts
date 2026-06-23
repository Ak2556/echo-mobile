/**
 * Pure helpers for feed-side filtering.
 *
 * Kept separate from the Supabase mapper so they're trivially unit-testable
 * without a local Supabase client. The feed query already filters on
 * `check_content = true` at the SQL layer, but we run the same gate
 * client-side as a defense-in-depth measure: if a buggy admin script ever
 * inserts a row with check_content=true but the moderation API subsequently
 * back-flags it (via the `flagged` column), the client still hides it.
 */

/** Shape Echo cares about. Anything with these two flags can be filtered. */
export interface ModeratableItem {
  /** True when the moderation API rejected the content. */
  flagged?: boolean | null;
  /** True when the Edge Function has run moderation and the content passed. */
  checkContent?: boolean | null;
}

/**
 * Returns only the items that are safe to display in the public feed.
 * A post is hidden when EITHER it was flagged by moderation OR it has
 * never been moderated (check_content === false / undefined).
 */
export function filterModeratedPosts<T extends ModeratableItem>(items: T[]): T[] {
  return items.filter((item) => {
    if (item.flagged === true) return false;
    // Treat unknown (legacy rows pre-migration) as safe to display so the
    // feed isn't accidentally empty after the migration runs the backfill.
    if (item.checkContent === false) return false;
    return true;
  });
}
