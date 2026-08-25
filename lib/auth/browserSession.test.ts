import { describe, expect, it, vi } from 'vitest';
import { settleAuthSession } from './browserSession';

const never = new Promise<never>(() => {});
const noWait = async () => {};

describe('settleAuthSession', () => {
  it('takes the redirect when the browser reports success', async () => {
    await expect(
      settleAuthSession({
        browser: Promise.resolve({ type: 'success', url: 'echo://auth/callback?code=abc' }),
        foreground: never,
        hasSession: async () => false,
        wait: noWait,
      }),
    ).resolves.toEqual({ kind: 'redirect', url: 'echo://auth/callback?code=abc' });
  });

  it('treats an ordinary dismissal as cancelled', async () => {
    for (const type of ['cancel', 'dismiss']) {
      await expect(
        settleAuthSession({
          browser: Promise.resolve({ type }),
          foreground: never,
          hasSession: async () => false,
          wait: noWait,
        }),
      ).resolves.toEqual({ kind: 'cancelled' });
    }
  });

  it('recovers when the browser never settles but the user is signed in', async () => {
    // The tab was torn down by another activity. openAuthSessionAsync hangs
    // forever, and meanwhile the Linking listener consumed the code.
    await expect(
      settleAuthSession({
        browser: never,
        foreground: Promise.resolve(),
        hasSession: async () => true,
        wait: noWait,
      }),
    ).resolves.toEqual({ kind: 'signed-in' });
  });

  it('gives up cleanly when the browser never settles and nothing happened', async () => {
    // The important part is that it resolves at all — the old code left the
    // button on "Signing in…" with no way back short of force-quitting.
    await expect(
      settleAuthSession({
        browser: never,
        foreground: Promise.resolve(),
        hasSession: async () => false,
        wait: noWait,
      }),
    ).resolves.toEqual({ kind: 'cancelled' });
  });

  it('waits out the grace period before declaring nothing happened', async () => {
    // Returning to the foreground and the redirect landing race each other, so
    // the session check must come after the pause, not before it.
    const order: string[] = [];
    const wait = vi.fn(async () => { order.push('waited'); });

    const outcome = await settleAuthSession({
      browser: never,
      foreground: Promise.resolve(),
      hasSession: async () => { order.push('checked'); return true; },
      wait,
      graceMs: 900,
    });

    expect(wait).toHaveBeenCalledWith(900);
    expect(order).toEqual(['waited', 'checked']);
    expect(outcome).toEqual({ kind: 'signed-in' });
  });

  it('prefers the browser result when both are ready', async () => {
    await expect(
      settleAuthSession({
        browser: Promise.resolve({ type: 'success', url: 'echo://auth/callback?code=xyz' }),
        foreground: Promise.resolve(),
        hasSession: async () => false,
        wait: noWait,
      }),
    ).resolves.toEqual({ kind: 'redirect', url: 'echo://auth/callback?code=xyz' });
  });
});
