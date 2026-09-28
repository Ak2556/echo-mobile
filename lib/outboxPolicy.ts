/**
 * When the outbox retries a write, and when it gives up on keeping one.
 * Pure, so the rules are tested without a store or a network.
 */

/** Longest wait between attempts. */
export const MAX_BACKOFF_MS = 15 * 60 * 1000;

/** How long a write that failed for good is kept before it is dropped. */
export const FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Wait before attempt `attempts + 1`: 1s, 2s, 4s ... capped at 15 minutes,
 * with jitter so a fleet coming back online does not retry in lockstep.
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts));
  return Math.round(base * (0.5 + random() / 2));
}

export interface Scheduled {
  status: 'pending' | 'failed';
  createdAt: number;
  nextAttemptAt?: number;
}

export function isDue(op: Scheduled, now: number): boolean {
  return op.status === 'pending' && (op.nextAttemptAt ?? 0) <= now;
}

/** The earliest moment a pending op becomes due, or null when none is waiting. */
export function nextWake(ops: Scheduled[], now: number): number | null {
  let earliest: number | null = null;
  for (const op of ops) {
    if (op.status !== 'pending') continue;
    const at = Math.max(op.nextAttemptAt ?? 0, now);
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

export function isExpiredFailure(op: Scheduled, now: number): boolean {
  return op.status === 'failed' && now - op.createdAt > FAILED_RETENTION_MS;
}
