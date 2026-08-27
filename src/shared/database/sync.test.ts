import { describe, it, expect, vi, beforeEach } from 'vitest';

// The sync body talks to WatermelonDB and Supabase; neither is needed to test
// that concurrent callers share one run.
const synchronize = vi.fn();
vi.mock('@nozbe/watermelondb/sync', () => ({ synchronize: (...a: unknown[]) => synchronize(...a) }));
vi.mock('./index', () => ({ database: {} }));
vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

import { syncDatabase } from './sync';

describe('syncDatabase concurrency', () => {
  // Braces matter: an arrow returning the mock hands Vitest a "teardown"
  // function, which it then calls and awaits after every test.
  beforeEach(() => { synchronize.mockReset(); });

  it('shares one run between overlapping callers', async () => {
    // WatermelonDB aborts the loser of a concurrent synchronize() *before it
    // commits*, discarding everything the pull had already fetched. Three
    // triggers exist — mount, foreground, and a 15s poll — so overlap is
    // routine, not exotic.
    let release: () => void = () => {};
    synchronize.mockImplementation(() => new Promise<void>(r => { release = r; }));

    const a = syncDatabase();
    const b = syncDatabase();
    const c = syncDatabase();

    expect(synchronize).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b, c]);
  });

  it('starts a fresh run once the previous one settles', async () => {
    synchronize.mockResolvedValue(undefined);
    await syncDatabase();
    await syncDatabase();
    expect(synchronize).toHaveBeenCalledTimes(2);
  });

  it('does not wedge after a failed sync', async () => {
    // If the in-flight handle were not cleared on rejection, one network blip
    // would stop the app syncing until it was restarted.
    synchronize.mockRejectedValueOnce(new Error('offline'));
    await expect(syncDatabase()).rejects.toThrow('offline');

    synchronize.mockResolvedValue(undefined);
    await expect(syncDatabase()).resolves.toBeUndefined();
    expect(synchronize).toHaveBeenCalledTimes(2);
  });
});
