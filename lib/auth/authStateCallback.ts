import type { Session } from '@supabase/supabase-js';

/**
 * Builds the callback handed to `supabase.auth.onAuthStateChange`.
 *
 * GoTrue runs subscriber callbacks inside its auth lock and awaits each one
 * (`_notifyAllSubscribers`). Any Supabase call made from inside the callback —
 * including a plain PostgREST query, which fetches the access token via
 * getSession() — re-enters that lock and waits for the callback that is holding
 * it. Nothing breaks the cycle: _recoverAndRefresh never finishes, the lock is
 * never released, initializePromise never resolves, and every later
 * getSession() hangs forever. Observed as a sign-in button stuck on
 * "Signing in…" on both iOS and Android.
 *
 * The rule this encodes: the callback must return without awaiting anything.
 * Real work is scheduled onto a later task, by which time the lock is free.
 */
export type AuthEvent = string;

export function makeAuthStateCallback(
  apply: (event: AuthEvent, session: Session | null) => Promise<void> | void,
  schedule: (fn: () => void) => void = fn => { setTimeout(fn, 0); },
): (event: AuthEvent, session: Session | null) => void {
  return (event, session) => {
    schedule(() => {
      try {
        void Promise.resolve(apply(event, session)).catch(() => {});
      } catch {
        // A subscriber must never surface an error into GoTrue's notify loop.
      }
    });
  };
}
