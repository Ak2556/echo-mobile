import type { AuthProfile, AuthStatus } from './types';

/**
 * Decide the post-session status from the profile row.
 *
 * Kept out of listener.ts so it can be tested without dragging in the Supabase
 * client, the app store and the deep-link handlers — this is the rule that
 * decides whether a person sees the signup wizard, and it was wrong for months
 * precisely because nothing exercised it.
 *
 * The rule it replaces was `Boolean(profile?.username)`. handle_new_user()
 * fills username on every signup, so that was always true and
 * 'needs-onboarding' never fired.
 */
export function statusForProfile(profile: AuthProfile | null): AuthStatus {
  // A null profile is a failed fetch or an RLS-hidden row, not a new user:
  // handle_new_user() creates the row during signup, so a signed-in user always
  // has one. Routing null into the wizard would push an established account
  // into a form whose step 3 overwrites their display name and username, on
  // nothing worse than a dropped request.
  if (profile == null) return 'ready';

  return profile.onboarded_at ? 'ready' : 'needs-onboarding';
}

/** Storage key for the user the server last confirmed as fully onboarded. */
export const ONBOARDED_USER_KEY = 'auth:onboardedUserId';

/**
 * The status a returning user can be given before the profile request returns.
 *
 * Cold start used to wait on a network round-trip to the database for this, and
 * app/index.tsx gives up on 'checking' after three seconds and shows the login
 * screen. On a slow connection the profile arrived just after that, so testers
 * saw the login screen for a moment before the app jumped to Home.
 *
 * It is keyed on the user id the server last confirmed as onboarded, not on
 * hasSeenOnboarding: that flag is set whenever a profile has a username, and
 * handle_new_user() gives every signup one, so someone stuck mid-wizard has it
 * too and would flash Home before being sent back. Null means ask the server.
 */
export function resumableStatus(
  onboardedUserId: string | null | undefined,
  sessionUserId: string | null | undefined,
): AuthStatus | null {
  return sessionUserId && onboardedUserId === sessionUserId ? 'ready' : null;
}
