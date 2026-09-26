import { describe, expect, it, vi } from 'vitest';
import { AUTH_TIMEOUT_MESSAGE, withAuthTimeout } from './timeout';
import { friendlyAuthError } from './friendlyAuthError';

/**
 * The contract here is the whole point: a timeout must come back as a VALUE,
 * not a rejection. Every screen in app/auth destructures `{ error }` and none
 * of them wrap the call — login.tsx has no try/catch at all — so a rejection
 * skips the code that clears the loading flag and the button spins forever.
 */
describe('withAuthTimeout', () => {
  it('passes a resolved result through untouched', async () => {
    const result = { data: { session: { id: 's1' } }, error: null };
    await expect(withAuthTimeout(Promise.resolve(result))).resolves.toBe(result);
  });

  it('resolves rather than rejects when the operation outlives the cap', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise(() => {});
      const raced = withAuthTimeout(pending as Promise<unknown>);
      await vi.advanceTimersByTimeAsync(15_000);

      const settled = (await raced) as { error: { message: string } };
      expect(settled.error.message).toBe(AUTH_TIMEOUT_MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries every data field the call sites destructure', async () => {
    vi.useFakeTimers();
    try {
      const raced = withAuthTimeout(new Promise(() => {}) as Promise<unknown>);
      await vi.advanceTimersByTimeAsync(15_000);

      // listener.ts reads `data.session`; providers/google.ts reads `data`.
      // A missing `data` would throw on destructure, which is the failure this
      // whole change exists to remove.
      const settled = (await raced) as { data: { session: unknown } };
      expect(settled.data).toBeDefined();
      expect(settled.data.session).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('converts a rejection from the operation into a result too', async () => {
    // supabase-js throws rather than returning when it cannot acquire the auth
    // lock within lockAcquireTimeout, and fetch faults surface the same way.
    // Either one escaping reaches login.tsx, which has no try/catch, and
    // strands the loading flag exactly as the timeout used to.
    const settled = (await withAuthTimeout(
      Promise.reject(new Error('Acquiring an exclusive Navigator LockManager lock timed out')),
    )) as { error: { message: string }; data: { session: unknown } };

    expect(settled.error.message).toMatch(/lock/i);
    expect(settled.data.session).toBeNull();
  });

  it('survives a non-Error rejection', async () => {
    const settled = (await withAuthTimeout(Promise.reject('plain string'))) as {
      error: { message: string };
    };
    expect(settled.error.message).toBe('plain string');
  });

  it('never rejects, whatever it is handed', async () => {
    await expect(withAuthTimeout(Promise.reject(new Error('boom')))).resolves.toBeDefined();
  });

  it('produces a message friendlyAuthError turns into advice', () => {
    expect(friendlyAuthError(AUTH_TIMEOUT_MESSAGE)).toBe(
      'That took too long. Check your connection and try again.',
    );
  });

  it('does not fire the timer once the operation has settled', async () => {
    vi.useFakeTimers();
    try {
      const result = { data: { session: null }, error: null };
      const settled = await withAuthTimeout(Promise.resolve(result));
      // If the timer were still live it would resolve a second value and leak
      // a handle; advancing past the cap must change nothing.
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(result);
    } finally {
      vi.useRealTimers();
    }
  });
});
