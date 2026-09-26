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
