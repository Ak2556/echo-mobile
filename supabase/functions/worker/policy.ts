// What the worker does with a message after a handler runs. Pure, so vitest
// covers the retry, dead-letter and expiry rules without a database.

/** Attempts before a message goes to the dead-letter queue. */
export const MAX_ATTEMPTS = 6;

/** Seconds a claimed message stays invisible to other drains. */
export const VISIBILITY_SECONDS = 120;

/** Messages claimed per round trip. */
export const BATCH = 10;

/**
 * Stop claiming after this long and leave the rest to the next kick or the
 * sweeper. Edge background work has a wall-clock limit; a drain that is cut
 * off mid-message only delays it (its visibility lapses), but ending cleanly
 * keeps the logs honest.
 */
export const DRAIN_BUDGET_MS = 100_000;

/**
 * A push that could not be sent for this long is noise ("X liked your post"
 * hours later). The notification row keeps the in-app inbox complete, so
 * dropping the push loses nothing.
 */
export const MAX_PUSH_AGE_MS = 6 * 60 * 60 * 1000;

export type Disposition = 'ack' | 'retry' | 'dead';

/** After a handler throws: back off and try again, or give up to the DLQ. */
export function onFailure(readCount: number): Disposition {
  return readCount >= MAX_ATTEMPTS ? 'dead' : 'retry';
}

/** Seconds until the next attempt: 30, 60, 120, ... capped at an hour. */
export function backoffSeconds(readCount: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(readCount - 1, 0));
}

export function isStale(enqueuedAtIso: string, now: number, maxAgeMs: number): boolean {
  const t = Date.parse(enqueuedAtIso);
  return Number.isFinite(t) && now - t > maxAgeMs;
}
