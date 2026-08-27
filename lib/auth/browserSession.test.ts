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
    // The poll loop calls wait() too, so the ms value is what tells the grace
    // pause apart from a poll tick.
    const order: string[] = [];
    const wait = vi.fn(async (ms: number) => { order.push(`waited:${ms}`); });

    const outcome = await settleAuthSession({
      browser: never,
      foreground: Promise.resolve(),
      hasSession: async () => { order.push('checked'); return true; },
      wait,
      graceMs: 900,
      pollMs: 1_000,
    });

    expect(wait).toHaveBeenCalledWith(900);
    const grace = order.indexOf('waited:900');
    expect(grace).toBeGreaterThanOrEqual(0);
    expect(order.slice(grace)).toEqual(['waited:900', 'checked']);
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

  // ---- Regression: the iOS hang (#50, #53 recurrence) ----------------------
  //
  // On iOS the Safari sheet is a scene hosted *inside* the app's own scene, so
  // the app never backgrounds and AppState never emits a change back to
  // 'active'. `foreground` therefore never resolves. If the sheet is then
  // invalidated rather than dismissed, openAuthSessionAsync never resolves
  // either — and a race between two promises that never settle hangs forever,
  // stranding the button on "Signing in…" until a force-quit.

  it('resolves when neither the browser nor the foreground ever reports', async () => {
    await expect(
      settleAuthSession({
        browser: never,
        foreground: never,
        hasSession: async () => false,
        wait: noWait,
        pollMs: 10,
        timeoutMs: 50,
      }),
    ).resolves.toEqual({ kind: 'cancelled' });
  });

  it('notices a session that landed while the browser was still hanging', async () => {
    // The redirect was consumed by the Linking listener. The user IS signed in;
    // only this promise does not know it yet.
    let calls = 0;
    await expect(
      settleAuthSession({
        browser: never,
        foreground: never,
        hasSession: async () => ++calls >= 2,
        wait: noWait,
        pollMs: 10,
        timeoutMs: 10_000,
      }),
    ).resolves.toEqual({ kind: 'signed-in' });
  });

  it('stops polling once the browser reports', async () => {
    const hasSession = vi.fn(async () => false);
    await settleAuthSession({
      browser: Promise.resolve({ type: 'success', url: 'echo://auth/callback?code=k' }),
      foreground: never,
      hasSession,
      wait: noWait,
      pollMs: 10,
      timeoutMs: 10_000,
    });
    await new Promise(r => setTimeout(r, 20));
    expect(hasSession.mock.calls.length).toBeLessThan(5);
  });
});
