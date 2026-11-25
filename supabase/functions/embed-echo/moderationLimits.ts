// How long each moderation call may take. Kept apart from moderation.ts, which
// reads Deno.env on import, so the limits can be tested against the worker's.

/**
 * The text check. It ran at 8 s and timed out on about 8% of calls (p50 1.6 s,
 * p95 6.4 s, 19-25 Nov 2026); each timeout left a post unpublished until a
 * retry. It runs in the background worker, so a longer wait costs no one.
 */
export const MODERATION_TIMEOUT_MS = 15_000;

/** A vision call carries whole images, so it gets longer than the text check. */
export const VISION_TIMEOUT_MS = 20_000;
