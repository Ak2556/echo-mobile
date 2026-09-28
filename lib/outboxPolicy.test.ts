import { describe, expect, it } from 'vitest';
import { FAILED_RETENTION_MS, MAX_BACKOFF_MS, backoffMs, isDue, isExpiredFailure, nextWake } from './outboxPolicy';

const mid = () => 0.5; // jitter factor 0.75

describe('outbox backoff', () => {
  it('doubles from a second, with jitter, capped', () => {
    expect([1, 2, 3].map((a) => backoffMs(a, mid))).toEqual([1500, 3000, 6000]);
    expect(backoffMs(30, () => 1)).toBe(MAX_BACKOFF_MS);
  });

  it('never waits less than half the base, so retries still spread out', () => {
    expect(backoffMs(3, () => 0)).toBe(4000);
  });
});

describe('scheduling', () => {
  const now = 1_000_000;
  const op = (o: Partial<{ status: 'pending' | 'failed'; nextAttemptAt: number; createdAt: number }>) => ({
    status: 'pending' as const,
    createdAt: now,
    ...o,
  });

  it('runs an op that has no wait, or whose wait is over', () => {
    expect(isDue(op({}), now)).toBe(true);
    expect(isDue(op({ nextAttemptAt: now - 1 }), now)).toBe(true);
    expect(isDue(op({ nextAttemptAt: now + 1 }), now)).toBe(false);
    expect(isDue(op({ status: 'failed' }), now)).toBe(false);
  });

  it('wakes for the earliest waiting op, and not at all when nothing waits', () => {
    expect(nextWake([op({ nextAttemptAt: now + 5000 }), op({ nextAttemptAt: now + 2000 })], now)).toBe(now + 2000);
    expect(nextWake([op({ status: 'failed' })], now)).toBeNull();
    expect(nextWake([], now)).toBeNull();
  });

  it('wakes now for an op that is already due', () => {
    expect(nextWake([op({ nextAttemptAt: now - 10 })], now)).toBe(now);
  });
});

describe('failed writes', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  it('are kept for a week, then dropped', () => {
    expect(isExpiredFailure({ status: 'failed', createdAt: now - FAILED_RETENTION_MS + 1000 }, now)).toBe(false);
    expect(isExpiredFailure({ status: 'failed', createdAt: now - FAILED_RETENTION_MS - 1000 }, now)).toBe(true);
  });

  it('never drops a pending write, however old', () => {
    expect(isExpiredFailure({ status: 'pending', createdAt: 0 }, now)).toBe(false);
  });
});
