import { describe, expect, it } from 'vitest';
import { authLock } from './authLock';

/**
 * The lock supabase-js uses to serialize token refreshes. This used to be
 *
 *   const authLock = async (_name, _timeout, fn) => fn();
 *
 * which satisfies the type, passes review, and holds nothing. Concurrent
 * refreshes — two of which happen routinely when the app returns from the
 * background — could then invalidate each other and sign the user out.
 *
 * So the test is about the property that matters, not the identity of the
 * implementation: two overlapping acquisitions must not interleave.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('authLock', () => {
  it('serializes overlapping acquisitions of the same key', async () => {
    const order: string[] = [];

    const slow = authLock('auth-token', -1, async () => {
      order.push('first:enter');
      await delay(25);
      order.push('first:exit');
    });
    // Starts while the first holder is still inside its await.
    const fast = authLock('auth-token', -1, async () => {
      order.push('second:enter');
      order.push('second:exit');
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(['first:enter', 'first:exit', 'second:enter', 'second:exit']);
  });

  it('releases the lock when the holder throws', async () => {
    await expect(
      authLock('auth-token', -1, async () => {
        throw new Error('refresh failed');
      }),
    ).rejects.toThrow('refresh failed');

    // A failed refresh must not wedge every later one.
    await expect(authLock('auth-token', -1, async () => 'ok')).resolves.toBe('ok');
  });

  it('passes the callback result through', async () => {
    await expect(authLock('auth-token', -1, async () => 42)).resolves.toBe(42);
  });
});
