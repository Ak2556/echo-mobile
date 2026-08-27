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
 * On iOS that foreground signal never arrives. The Safari sheet is a scene
 * hosted *inside* the app's own scene (UISceneHosting-<bundle>:UIHostedScene-
 * com.apple.SafariViewService), so the app never enters the background and
 * AppState never emits a change back to 'active'. When the sheet is then
 * invalidated rather than dismissed — "View service session ended with error
 * ... Invalidation requested" — openAuthSessionAsync does not resolve either,
 * and a race between two promises that never settle hangs forever. That is the
 * bug #50 and #53 both aimed at and missed: they assumed the app backgrounds,
 * which holds for Android Custom Tabs but not for iOS.
 *
 * So neither arm of the race can be trusted to fire. A third arm polls the
 * question that actually matters — is there a session yet? — and a hard cap
 * guarantees the promise settles even when nothing ever reports.
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
  /**
   * How often to ask whether a session appeared while neither the browser nor
   * the foreground reported. getSession reads local storage, so this is cheap.
   */
  pollMs?: number;
  /**
   * Hard cap on the whole flow. Past this the sheet is treated as over however
   * it ended, which frees the button to be tapped again. Long enough for a
   * password and a 2FA round trip; expiring early is not damaging, because the
   * redirect is still consumed by the Linking listener and the callback screen
   * whenever it does arrive.
   */
  timeoutMs?: number;
}

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function settleAuthSession(deps: SettleDeps): Promise<SessionOutcome> {
  const {
    browser,
    foreground,
    hasSession,
    wait = defaultWait,
    graceMs = 900,
    pollMs = 1_000,
    timeoutMs = 90_000,
  } = deps;

  const INTERRUPTED = Symbol('interrupted');
  const SIGNED_IN = Symbol('signed-in');
  const EXPIRED = Symbol('expired');

  // Set once the race is decided, so the poll loop stops asking rather than
  // running on in the background for the rest of the timeout.
  let settled = false;

  const polled = (async () => {
    const rounds = Math.max(1, Math.ceil(timeoutMs / pollMs));
    for (let i = 0; i < rounds; i++) {
      await wait(pollMs);
      if (settled) return EXPIRED;
      try {
        if (await hasSession()) return SIGNED_IN;
      } catch {
        // A failed session read is not an answer. Keep waiting for a better one.
      }
      if (settled) return EXPIRED;
    }
    return EXPIRED;
  })();

  const winner = await Promise.race([
    browser,
    foreground.then(() => INTERRUPTED as unknown as BrowserResult),
    polled as unknown as Promise<BrowserResult>,
  ]);
  settled = true;

  if ((winner as unknown) === SIGNED_IN) return { kind: 'signed-in' };

  if ((winner as unknown) !== INTERRUPTED && (winner as unknown) !== EXPIRED) {
    const result = winner as BrowserResult;
    if (result.type === 'success' && result.url) return { kind: 'redirect', url: result.url };
    // 'cancel' and 'dismiss' are both the user backing out.
    return { kind: 'cancelled' };
  }

  // Either the app came back to the front with the browser silent, or nothing
  // reported at all before the cap. Let any in-flight exchange land, then ask
  // once more before giving up.
  await wait(graceMs);
  return (await hasSession()) ? { kind: 'signed-in' } : { kind: 'cancelled' };
}
