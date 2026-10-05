import { describe, expect, it, vi } from 'vitest';
import { createIdBatcher } from './idBatcher';

function setup(over: Partial<Parameters<typeof createIdBatcher>[0]> = {}) {
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const flush = vi.fn(async (_ids: string[]) => {});
  const overflow = vi.fn();
  const batcher = createIdBatcher({
    windowMs: 100, maxBatch: 3, flush, overflow,
    schedule: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    cancel: (h) => { (h as { live: boolean }).live = false; },
    ...over,
  });
  const fire = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });
  return { batcher, flush, overflow, fire, timers };
}

describe('createIdBatcher', () => {
  it('turns a burst into one flush of distinct ids', () => {
    const { batcher, flush, fire, timers } = setup();
    batcher.add('a'); batcher.add('b'); batcher.add('a');
    expect(timers).toHaveLength(1); // one window, not one per event
    fire();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(['a', 'b']);
  });

  it('hands an oversized burst to overflow instead of chasing ids', () => {
    const { batcher, flush, overflow, fire } = setup();
    ['a', 'b', 'c', 'd'].forEach((i) => batcher.add(i));
    fire();
    expect(overflow).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
  });

  it('falls back to overflow when the flush fails', async () => {
    const { batcher, overflow, fire } = setup({ flush: async () => { throw new Error('offline'); } });
    batcher.add('a');
    fire();
    await Promise.resolve(); await Promise.resolve();
    expect(overflow).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh window after each flush', () => {
    const { batcher, flush, fire } = setup();
    batcher.add('a'); fire();
    batcher.add('b'); fire();
    expect(flush.mock.calls).toEqual([[['a']], [['b']]]);
  });

  it('does nothing after dispose', () => {
    const { batcher, flush, fire } = setup();
    batcher.add('a');
    batcher.dispose();
    batcher.add('b');
    fire();
    expect(flush).not.toHaveBeenCalled();
  });
});
