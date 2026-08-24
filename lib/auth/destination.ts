import type { Href } from 'expo-router';
import type { AuthStatus } from './types';

/**
 * Where a given auth status should send someone standing on a given route.
 *
 * Pulled out of AuthListenerProvider as a pure function for two reasons. It is
 * the part worth testing, and it has to be answerable at any moment rather
 * than only at the instant the status changes.
 *
 * That distinction was the Google sign-in bug. Routing used to run from
 *
 *     useAuthStore.subscribe((s, prev) => {
 *       if (s.status === prev.status) return;
 *       routeFor(router, pathname, s.status);
 *     });
 *
 * which fires on the edge. Google's callback has three independent consumers
 * of a single-use PKCE code — the browser result in providers/google.ts, the
 * Linking event in the listener, and app/auth/callback.tsx — so whichever ran
 * first flipped the status to 'ready' before the callback screen had mounted.
 * The screen then rendered its spinner and waited for a change that had already
 * happened. Nothing navigated, and the user had to kill the app: a cold start
 * routes through app/index.tsx, which reads the persisted session on mount.
 *
 * Returning a destination instead of navigating lets the caller ask the
 * question on mount as well as on change.
 *
 * Null means stay put.
 */
export function destinationFor(pathname: string, status: AuthStatus): Href | null {
  // Nothing is known yet; moving now would fight the resolution.
  if (status === 'checking') return null;

  // Never yank someone out of the wizard mid-answer.
  if (pathname === '/auth/signup-wizard' && status === 'needs-onboarding') return null;

  if (status === 'signed-out') {
    return pathname.startsWith('/auth/') ? null : '/auth/login';
  }

  if (status === 'needs-onboarding') {
    return '/auth/signup-wizard';
  }

  // status === 'ready'
  // Only rescue people who are still sitting on an auth screen or the index
  // redirect. Someone deep in the app stays where they are.
  return pathname.startsWith('/auth/') || pathname === '/' ? '/(tabs)/home' : null;
}
