/**
 * Settling an OAuth browser session that may never settle on its own.
 *
 * WebBrowser.openAuthSessionAsync resolves when the redirect fires or the user
 * dismisses the tab in the ordinary way. It does not resolve reliably when the
 * tab is torn down by something else — another activity coming to the front, a
 * call, the OS reclaiming it. The promise then hangs, and because the sign-in
 * screen guards with `if (googleLoading) return`, the button stays on
 * "Signing in…" and refuses every retry until the app is force-quit.
 *
 * Returning to the foreground is the missing signal. If the app is in front
 * again and the browser has not reported anything, the session is over one way
 * or the other. Which way depends on a question worth asking before giving up:
 * is there a session now? The redirect is consumed by up to three places
 * (providers/google.ts, the Linking listener, the callback screen), so the
 * sign-in may well have completed while this promise was still waiting.
 *
 * Dependencies are injected so this is testable without a device.
 */

export type BrowserResult = { type: string; url?: string | null };

export type SessionOutcome =
  /** The browser came back with the redirect. Normal path. */
  | { kind: 'redirect'; url: string }
  /** Interrupted, but a session exists — someone else finished the exchange. */
  | { kind: 'signed-in' }
  /** Interrupted or dismissed with nothing to show for it. */
  | { kind: 'cancelled' };

export interface SettleDeps {
  /** The openAuthSessionAsync promise. */
  browser: Promise<BrowserResult>;
  /** Resolves the next time the app returns to the foreground. */
  foreground: Promise<void>;
  /** Whether a Supabase session exists right now. */
  hasSession: () => Promise<boolean>;
  /** Sleep, injectable for tests. */
  wait?: (ms: number) => Promise<void>;
  /**
   * After the app returns to the foreground, the redirect may still be in
   * flight — the deep link and the AppState change race each other. Give the
   * exchange a moment before concluding nothing happened.
   */
  graceMs?: number;
}

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function settleAuthSession(deps: SettleDeps): Promise<SessionOutcome> {
  const { browser, foreground, hasSession, wait = defaultWait, graceMs = 900 } = deps;

  const INTERRUPTED = Symbol('interrupted');
  const winner = await Promise.race([
    browser,
    foreground.then(() => INTERRUPTED as unknown as BrowserResult),
  ]);

  if ((winner as unknown) !== INTERRUPTED) {
    const result = winner as BrowserResult;
    if (result.type === 'success' && result.url) return { kind: 'redirect', url: result.url };
    // 'cancel' and 'dismiss' are both the user backing out.
    return { kind: 'cancelled' };
  }

  // The app is in front again and the browser never reported. Let any in-flight
  // exchange land before deciding.
  await wait(graceMs);
  return (await hasSession()) ? { kind: 'signed-in' } : { kind: 'cancelled' };
}
