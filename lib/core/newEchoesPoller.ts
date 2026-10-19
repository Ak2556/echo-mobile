/**
 * Counts the echoes published since the feed was last shown, for the "N new echoes" pill on Home.
 *
 * This used to be a Realtime subscription to every INSERT on public_echoes. That table is not in the
 * realtime publication (it holds only notifications, direct_messages and calls), so the subscription
 * never received an event and the pill never appeared. Publishing the table would mean every online
 * client receives every new post (a global, unfiltered fan-out, which is why it was left out), so this
 * polls a cheap indexed count instead.
 *
 * Pure: the clock, the timers and the query are injected, so the schedule can be tested under node.
 *
 * Rules, each one a place a naive version goes wrong:
 *  - The count is ABSOLUTE since the baseline, not additive, so a missed or repeated poll cannot drift.
 *  - Polls never overlap: a slow request does not queue another behind it.
 *  - reset() moves the baseline and the count to zero, and a request that was already in flight when
 *    it happened is discarded rather than allowed to bring the old count back.
 *  - stop() discards an in-flight result too, so nothing updates state after the screen has gone.
 *  - A failed poll keeps the last count. The pill is a convenience; it must never throw or clear itself.
 *  - The baseline is the device clock. A phone minutes off the server clock sees a few extra or missing
 *    echoes in the pill, which is harmless; the feed itself does not depend on it.
 */
export const NEW_ECHOES_POLL_MS = 60_000;

export interface NewEchoesPollerDeps {
  /** Echoes created after this ISO time that the viewer could see and did not write. */
  fetchCount: (sinceIso: string) => Promise<number>;
  onCount: (count: number) => void;
  intervalMs?: number;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export interface NewEchoesPoller {
  /** Begin polling. `immediate` also checks right away (used when returning to the screen). */
  start: (opts?: { immediate?: boolean }) => void;
  stop: () => void;
  /** The user tapped the pill or refreshed: count from now. */
  reset: () => void;
  isRunning: () => boolean;
}

export function createNewEchoesPoller(deps: NewEchoesPollerDeps): NewEchoesPoller {
  const intervalMs = deps.intervalMs ?? NEW_ECHOES_POLL_MS;
  const now = deps.now ?? Date.now;
  const setIntervalFn = deps.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearIntervalFn = deps.clearIntervalFn ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));

  let since = new Date(now()).toISOString();
  let handle: unknown = null;
  let running = false;
  let inflight = false;
  let generation = 0;

  const tick = async () => {
    if (inflight) return;
    inflight = true;
    const started = generation;
    try {
      const n = await deps.fetchCount(since);
      if (started === generation && running) deps.onCount(n);
    } catch {
      // Keep the last count; the next poll tries again.
    } finally {
      inflight = false;
    }
  };

  return {
    start(opts) {
      if (running) return;
      running = true;
      handle = setIntervalFn(() => { void tick(); }, intervalMs);
      if (opts?.immediate) void tick();
    },
    stop() {
      if (!running) return;
      running = false;
      generation += 1;
      if (handle != null) clearIntervalFn(handle);
      handle = null;
    },
    reset() {
      since = new Date(now()).toISOString();
      generation += 1;
      deps.onCount(0);
    },
    isRunning: () => running,
  };
}
