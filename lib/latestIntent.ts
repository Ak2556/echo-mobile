/**
 * Toggles (like, bookmark, repost, follow, comment like) where the user's
 * LAST tap is the only one that matters.
 *
 * Each tap used to fire its own request. A quick like → unlike put two
 * requests in flight at once, each auto-retried on transient errors, and
 * nothing ordered them: if the like landed last, the server kept it while
 * the heart showed empty. Each failure also reverted the UI to the opposite
 * of its own tap, even when a newer tap owned the UI by then, and each
 * settle refetched mid-burst and flashed an intermediate state.
 *
 * send() runs one request at a time per key, and each turn sends the value
 * the user wants NOW, not the one it was called with. A turn whose target is
 * already on the server is skipped. So like → unlike → like makes at most
 * one request after the first, and the server ends on the last tap.
 *
 * Retries happen inside the turn and re-read the latest value on every
 * attempt. A TanStack `retry` must NOT be used with this: it re-runs the
 * mutation with its original variables, which would re-assert an old tap
 * over a newer one.
 *
 * The key's state exists only while taps are in flight. Keeping `applied`
 * afterwards would go stale the moment the value changes on another device,
 * and a later tap would be skipped as "already sent".
 */
import { retryWithBackoff } from './retry';

type Entry<T> = { desired: T; applied?: { value: T }; chain: Promise<void>; inFlight: number };

export type IntentRetry = { retries?: number; baseMs?: number; shouldRetry?: (err: unknown) => boolean };

export function createLatestIntent<T>() {
  const entries = new Map<string, Entry<T>>();

  return {
    /** Record `value` as the latest intent for `key`, and resolve once it is on the server. */
    async send(key: string, value: T, write: (value: T) => Promise<void>, retry: IntentRetry = {}): Promise<void> {
      let entry = entries.get(key);
      if (!entry) {
        entry = { desired: value, chain: Promise.resolve(), inFlight: 0 };
        entries.set(key, entry);
      }
      const e = entry;
      e.desired = value;
      e.inFlight += 1;

      const turn = e.chain.then(() => retryWithBackoff(async () => {
        const target = e.desired;
        if (e.applied && Object.is(e.applied.value, target)) return;
        await write(target);
        e.applied = { value: target };
      }, {
        retries: retry.retries ?? 0,
        baseMs: retry.baseMs,
        shouldRetry: retry.shouldRetry ? (err: unknown) => retry.shouldRetry!(err) : undefined,
      }));
      // The chain must survive a failed turn, or every later tap would reject.
      e.chain = turn.catch(() => undefined);

      try {
        await turn;
      } finally {
        e.inFlight -= 1;
        if (e.inFlight === 0 && entries.get(key) === e) entries.delete(key);
      }
    },

    /**
     * Whether `value` is still what the user wants for `key`. A failed tap may
     * undo its optimistic update only if no newer tap has replaced it.
     * With nothing in flight for the key, the tap was the last word.
     */
    isLatest(key: string, value: T): boolean {
      const entry = entries.get(key);
      return !entry || Object.is(entry.desired, value);
    },

    /** No tap is in flight for `key`: safe to refetch without flashing a mid-burst state. */
    isIdle(key: string): boolean {
      return !entries.has(key);
    },
  };
}
