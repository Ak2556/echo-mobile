import { describe, expect, it, vi } from 'vitest';
import { makeAuthStateCallback } from './authStateCallback';

describe('makeAuthStateCallback', () => {
  it('returns synchronously without awaiting the work', () => {
    // The invariant that was violated: an async callback kept GoTrue's auth
    // lock held while it awaited a Supabase query, deadlocking the client.
    const apply = vi.fn(async () => { await new Promise(() => {}); });
    const cb = makeAuthStateCallback(apply, fn => fn());
    const returned = cb('SIGNED_IN', null);
    expect(returned).toBeUndefined();
  });

  it('does not run the work during the callback itself', () => {
    const apply = vi.fn();
    const queued: Array<() => void> = [];
    const cb = makeAuthStateCallback(apply, fn => { queued.push(fn); });

    cb('SIGNED_IN', null);
    expect(apply).not.toHaveBeenCalled();

    queued.forEach(fn => fn());
    expect(apply).toHaveBeenCalledWith('SIGNED_IN', null);
  });

  it('swallows a rejecting handler rather than surfacing it to GoTrue', async () => {
    const apply = vi.fn(async () => { throw new Error('profile fetch failed'); });
    const cb = makeAuthStateCallback(apply, fn => fn());
    expect(() => cb('SIGNED_IN', null)).not.toThrow();
    await Promise.resolve();
  });

  it('defaults to scheduling on a later task', async () => {
    const apply = vi.fn();
    const cb = makeAuthStateCallback(apply);
    cb('SIGNED_OUT', null);
    expect(apply).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 5));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
