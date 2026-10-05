import { describe, expect, it, vi } from 'vitest';
import { runPostFanout } from './postFanout';

// A fake follower list of N ids, served the way the SQL function does: a batch of
// `limit` after the cursor, returning the last id only when the batch was full.
function server(n: number) {
  const ids = Array.from({ length: n }, (_, i) => String(i).padStart(6, '0'));
  const calls: { after: string | null; limit: number }[] = [];
  return {
    calls,
    batch: vi.fn(async (_echo: string, after: string | null, limit: number) => {
      calls.push({ after, limit });
      const rest = ids.filter((id) => after === null || id > after).slice(0, limit);
      return rest.length >= limit ? rest[rest.length - 1] : null;
    }),
  };
}

describe('runPostFanout', () => {
  it('walks every follower in keyset batches and stops on the last partial batch', async () => {
    const s = server(1_250);
    const continueFrom = vi.fn();
    const r = await runPostFanout('e1', null, { batch: s.batch, continueFrom, batchSize: 500 });
    expect(r).toEqual({ batches: 3, finished: true });
    expect(s.calls.map((c) => c.after)).toEqual([null, '000499', '000999']);
    expect(continueFrom).not.toHaveBeenCalled();
  });

  it('does one cheap call for an author with no followers', async () => {
    const s = server(0);
    expect(await runPostFanout('e1', null, { batch: s.batch, continueFrom: vi.fn() })).toEqual({ batches: 1, finished: true });
  });

  it('an exact multiple costs one extra empty batch, never a missed follower', async () => {
    const s = server(1_000);
    const r = await runPostFanout('e1', null, { batch: s.batch, continueFrom: vi.fn(), batchSize: 500 });
    expect(r).toEqual({ batches: 3, finished: true });
  });

  it('hands the rest to a new job, with its cursor, when the time budget is spent', async () => {
    const s = server(10_000);
    let t = 0;
    const continueFrom = vi.fn(async () => {});
    const r = await runPostFanout('e1', null, {
      batch: s.batch, continueFrom, batchSize: 500, budgetMs: 1_000,
      now: () => (t += 400), // every call "takes" 400 ms
    });
    expect(r.finished).toBe(false);
    expect(continueFrom).toHaveBeenCalledTimes(1);
    expect(continueFrom).toHaveBeenCalledWith('e1', expect.stringMatching(/^\d{6}$/));
  });

  it('resumes from a cursor', async () => {
    const s = server(1_200);
    const r = await runPostFanout('e1', '000999', { batch: s.batch, continueFrom: vi.fn(), batchSize: 500 });
    expect(r.finished).toBe(true);
    expect(s.calls[0].after).toBe('000999');
  });

  it('lets a database error through so the job is retried', async () => {
    await expect(runPostFanout('e1', null, {
      batch: async () => { throw new Error('db down'); }, continueFrom: vi.fn(),
    })).rejects.toThrow('db down');
  });
});
