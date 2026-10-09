import { describe, expect, it, vi } from 'vitest';
import { createAltTextLoader } from './altTextLoader';

function setup(found: Record<string, string[]> = {}, maxBatch = 50) {
  const fetchMany = vi.fn(async (ids: string[]) => Object.fromEntries(ids.filter(i => found[i]).map(i => [i, found[i]])));
  let run: (() => void) | null = null;
  const loader = createAltTextLoader({ fetchMany, maxBatch, schedule: (fn) => { run = fn; return 0; } });
  return { loader, fetchMany, tick: () => run?.() };
}

describe('createAltTextLoader', () => {
  it('sends the ids asked for in one window as one request', async () => {
    const { loader, fetchMany, tick } = setup({ a: ['dog'], b: ['car'] });
    const pa = loader.load('a');
    const pb = loader.load('b');
    tick();
    expect(await pa).toEqual(['dog']);
    expect(await pb).toEqual(['car']);
    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(fetchMany).toHaveBeenCalledWith(['a', 'b']);
  });

  it('resolves a post with no descriptions to an empty list, not undefined', async () => {
    const { loader, tick } = setup({});
    const p = loader.load('none');
    tick();
    expect(await p).toEqual([]);
  });

  it('asks once for an id requested twice and answers both callers', async () => {
    const { loader, fetchMany, tick } = setup({ a: ['x'] });
    const p1 = loader.load('a');
    const p2 = loader.load('a');
    tick();
    expect(await p1).toEqual(['x']);
    expect(await p2).toEqual(['x']);
    expect(fetchMany).toHaveBeenCalledWith(['a']);
  });

  it('splits a crowd larger than one request allows', async () => {
    const { loader, fetchMany, tick } = setup({}, 2);
    const all = ['a', 'b', 'c', 'd', 'e'].map(id => loader.load(id));
    tick();
    await Promise.all(all);
    expect(fetchMany.mock.calls.map(c => c[0].length)).toEqual([2, 2, 1]);
  });

  it('rejects every caller in a failed request, and the next window starts clean', async () => {
    let fail = true;
    let run: (() => void) | null = null;
    const loader = createAltTextLoader({
      fetchMany: async () => { if (fail) throw new Error('offline'); return { a: ['ok'] }; },
      schedule: (fn) => { run = fn; return 0; },
    });
    const bad = loader.load('a');
    run!();
    await expect(bad).rejects.toThrow('offline');
    fail = false;
    const good = loader.load('a');
    run!();
    expect(await good).toEqual(['ok']);
  });
});
