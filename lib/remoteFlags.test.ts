import { describe, expect, it, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../store/persist', () => ({
  storage: {
    getString: (k: string) => store.get(k),
    set: (k: string, v: string) => { store.set(k, v); },
    delete: (k: string) => { store.delete(k); },
    clearAll: () => { store.clear(); },
  },
}));

const selectMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: selectMock }) },
}));

import {
  isFeatureEnabled,
  refreshRemoteFlags,
  subscribeToFlags,
  __resetFlagsForTest,
} from './remoteFlags';

beforeEach(() => {
  store.clear();
  selectMock.mockReset();
  __resetFlagsForTest();
});

describe('flag resolution', () => {
  it('falls back to the compiled default when nothing is cached', () => {
    expect(isFeatureEnabled('miniApps')).toBe(true);
    expect(isFeatureEnabled('salons')).toBe(false);
  });

  it('lets a remote row override the compiled default', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('keeps the last good value when the fetch fails', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    selectMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('keeps the last good value when the client throws', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    selectMock.mockRejectedValue(new Error('network down'));
    await expect(refreshRemoteFlags()).resolves.toBeUndefined();
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('ignores keys that are not real flags', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'notAFlag', enabled: true }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('ignores a row whose enabled is not a boolean', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: 'yes' }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('falls back to compiled defaults when the cache is corrupt', () => {
    store.set('echo:remoteFlags', '{not json');
    __resetFlagsForTest();
    expect(isFeatureEnabled('miniApps')).toBe(true);
    expect(store.has('echo:remoteFlags')).toBe(false);
  });

  it('rejects a tampered cache entry that is not a known boolean flag', () => {
    store.set('echo:remoteFlags', JSON.stringify({ miniApps: 'true', evil: true }));
    __resetFlagsForTest();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('survives a restart by reading the cache synchronously', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    __resetFlagsForTest(); // simulates a fresh process reading the same storage
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('notifies subscribers only when a value actually changed', async () => {
    const seen = vi.fn();
    const unsub = subscribeToFlags(seen);
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: true }], error: null });
    await refreshRemoteFlags();
    expect(seen).not.toHaveBeenCalled();
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    expect(seen).toHaveBeenCalledTimes(1);
    unsub();
  });
});
