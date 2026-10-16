import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_MS, MAX_IDS, POLL_MS, createHeartbeat, presenceIdKey, presencePhrase, startPresencePolling, usePresenceStore,
} from './presenceCore';

beforeEach(() => { vi.useFakeTimers(); usePresenceStore.getState().clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('presencePhrase', () => {
  it('says nothing without an entry or a code', () => {
    expect(presencePhrase(undefined)).toBeNull();
    expect(presencePhrase({ online: false, lastActive: null })).toBeNull();
  });
  it('says "Active now" for an online person, whatever the code', () => {
    expect(presencePhrase({ online: true, lastActive: null })).toBe('Active now');
    expect(presencePhrase({ online: true, lastActive: 'today' })).toBe('Active now');
  });
  it('maps every code to its phrase', () => {
    expect(presencePhrase({ online: false, lastActive: 'recent' })).toBe('Active recently');
    expect(presencePhrase({ online: false, lastActive: 'today' })).toBe('Active today');
    expect(presencePhrase({ online: false, lastActive: 'yesterday' })).toBe('Active yesterday');
    expect(presencePhrase({ online: false, lastActive: 'this_week' })).toBe('Active this week');
  });
});

describe('usePresenceStore', () => {
  it('keeps the latest answer per person and merges new rows over old ones', () => {
    const { apply } = usePresenceStore.getState();
    apply([{ user_id: 'a', online: true, last_active: null }, { user_id: 'b', online: false, last_active: 'today' }]);
    apply([{ user_id: 'a', online: false, last_active: 'recent' }]);
    expect(usePresenceStore.getState().byUser).toEqual({
      a: { online: false, lastActive: 'recent' },
      b: { online: false, lastActive: 'today' },
    });
  });
  it('clears on sign-out', () => {
    usePresenceStore.getState().apply([{ user_id: 'a', online: true, last_active: null }]);
    usePresenceStore.getState().clear();
    expect(usePresenceStore.getState().byUser).toEqual({});
  });
});

describe('createHeartbeat', () => {
  it('pings at once, then every minute, and stops cleanly', () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(ping);
    hb.start();
    expect(ping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(ping).toHaveBeenCalledTimes(4);
    hb.stop();
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(ping).toHaveBeenCalledTimes(4);
    expect(hb.running).toBe(false);
  });
  it('starting twice does not double the rate', () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(ping);
    hb.start(); hb.start();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(ping).toHaveBeenCalledTimes(2);
    hb.stop();
  });
  it('survives a failing ping', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('offline'));
    const hb = createHeartbeat(ping);
    expect(() => hb.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(ping).toHaveBeenCalledTimes(2);
    hb.stop();
  });
});

describe('startPresencePolling', () => {
  it('fetches now and every 45 seconds, applying each answer', async () => {
    const rows = [{ user_id: 'a', online: true, last_active: null }];
    const fetchRows = vi.fn().mockResolvedValue(rows);
    const apply = vi.fn();
    const stop = startPresencePolling(['a'], fetchRows, apply);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRows).toHaveBeenCalledWith(['a']);
    expect(apply).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(apply).toHaveBeenCalledTimes(2);
    stop();
  });
  it('drops an answer that arrives after stop, and a failed poll changes nothing', async () => {
    let resolve!: (r: never[]) => void;
    const slow = vi.fn(() => new Promise<never[]>(r => { resolve = r; }));
    const apply = vi.fn();
    const stop = startPresencePolling(['a'], slow, apply);
    stop();
    resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(apply).not.toHaveBeenCalled();

    const failing = vi.fn().mockRejectedValue(new Error('network'));
    const stop2 = startPresencePolling(['a'], failing, apply);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(apply).not.toHaveBeenCalled();
    stop2();
  });
});

describe('presenceIdKey', () => {
  it('is unique, excludes me and nulls, sorted, and capped at 50', () => {
    expect(presenceIdKey(['b', 'a', 'b', null, undefined, 'me'], 'me')).toBe('a,b');
    const many = Array.from({ length: 80 }, (_, i) => `id${String(i).padStart(3, '0')}`);
    expect(presenceIdKey(many, null).split(',')).toHaveLength(MAX_IDS);
  });
  it('is empty when there is nobody to ask about', () => {
    expect(presenceIdKey([], 'me')).toBe('');
    expect(presenceIdKey(['me'], 'me')).toBe('');
  });
});
