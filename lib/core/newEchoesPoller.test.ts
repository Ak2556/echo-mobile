import { describe, expect, it } from 'vitest';
import { createNewEchoesPoller, NEW_ECHOES_POLL_MS } from './newEchoesPoller';

// A manual clock and timer, so the schedule is exact and nothing waits.
function harness(fetchImpl: (since: string) => Promise<number> | number) {
  let t = Date.parse('2026-10-19T12:00:00.000Z');
  const timers: Array<{ fn: () => void; ms: number; id: number }> = [];
  let nextId = 1;
  const counts: number[] = [];
  const sinces: string[] = [];
  const poller = createNewEchoesPoller({
    fetchCount: async (since) => { sinces.push(since); return fetchImpl(since); },
    onCount: (n) => counts.push(n),
    now: () => t,
    setIntervalFn: (fn, ms) => { const id = nextId++; timers.push({ fn, ms, id }); return id; },
    clearIntervalFn: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  });
  const advance = (ms: number) => { t += ms; };
  const fire = async () => { timers.forEach((x) => x.fn()); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { poller, counts, sinces, timers, advance, fire };
}

describe('new echoes poller', () => {
  it('polls once a minute and reports the absolute count', async () => {
    const h = harness(() => 3);
    h.poller.start();
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].ms).toBe(NEW_ECHOES_POLL_MS);
    expect(h.sinces).toHaveLength(0); // nothing at start: the baseline is "now", the count is 0
    await h.fire();
    expect(h.counts).toEqual([3]);
    await h.fire();
    expect(h.counts).toEqual([3, 3]); // absolute, not 3 then 6
  });

  it('can check straight away when returning to the screen', async () => {
    const h = harness(() => 2);
    h.poller.start({ immediate: true });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.counts).toEqual([2]);
  });

  it('counts from the baseline, and reset() moves the baseline and clears the count', async () => {
    const h = harness(() => 5);
    h.poller.start();
    const first = '2026-10-19T12:00:00.000Z';
    await h.fire();
    expect(h.sinces[0]).toBe(first);
    h.advance(90_000);
    h.poller.reset();
    expect(h.counts.at(-1)).toBe(0);
    await h.fire();
    expect(h.sinces[1]).toBe('2026-10-19T12:01:30.000Z'); // the new baseline
  });

  it('never overlaps polls', async () => {
    let release: (n: number) => void = () => {};
    const h = harness(() => new Promise<number>((r) => { release = r; }));
    h.poller.start();
    h.timers[0].fn();
    h.timers[0].fn(); // a second tick while the first is still waiting
    expect(h.sinces).toHaveLength(1);
    release(4);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.counts).toEqual([4]);
  });

  it('discards a result that was in flight when the user reset', async () => {
    let release: (n: number) => void = () => {};
    const h = harness(() => new Promise<number>((r) => { release = r; }));
    h.poller.start();
    h.timers[0].fn();
    h.poller.reset(); // the user tapped the pill
    release(9);       // the old count arrives afterwards
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.counts).toEqual([0]); // the stale 9 did not bring the pill back
  });

  it('discards a result that arrives after stop()', async () => {
    let release: (n: number) => void = () => {};
    const h = harness(() => new Promise<number>((r) => { release = r; }));
    h.poller.start();
    h.timers[0].fn();
    h.poller.stop();
    release(7);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.counts).toEqual([]);
    expect(h.timers).toHaveLength(0);
  });

  it('keeps the last count when a poll fails, and keeps polling', async () => {
    let calls = 0;
    const h = harness(() => { calls += 1; if (calls === 2) throw new Error('offline'); return 6; });
    h.poller.start();
    await h.fire();
    await h.fire(); // fails
    await h.fire();
    expect(h.counts).toEqual([6, 6]); // the failure produced no update and no throw
    expect(h.poller.isRunning()).toBe(true);
  });

  it('start() twice does not create two timers, and stop() is idempotent', () => {
    const h = harness(() => 0);
    h.poller.start(); h.poller.start();
    expect(h.timers).toHaveLength(1);
    h.poller.stop(); h.poller.stop();
    expect(h.timers).toHaveLength(0);
    expect(h.poller.isRunning()).toBe(false);
  });
});
