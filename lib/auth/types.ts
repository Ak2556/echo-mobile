import type { Session } from '@supabase/supabase-js';

/**
 * Auth status — what should the app render right now?
 *
 *  - `checking`: initial cold-start, waiting on getSession()
 *  - `signed-out`: no valid session
 *  - `needs-onboarding`: session and profile exist, but the wizard was never
 *    finished — `profile.onboarded_at` is null
 *  - `ready`: session present and onboarding settled, app can render
 *
 * `needs-onboarding` used to mean "profile.username is empty", which was never
 * true: handle_new_user() fills username on every signup. See
 * 20260926120000_profile_onboarding_state.sql.
 */
export type AuthStatus = 'checking' | 'signed-out' | 'needs-onboarding' | 'ready';

export type AuthProfile = {
  id: string;
  username: string | null;
  /** Null until the signup wizard completes. Drives `needs-onboarding`. */
  onboarded_at?: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  is_private?: boolean;
  dm_privacy?: 'everyone' | 'followers' | 'nobody';
  activity_status?: boolean;
  online_status?: boolean;
  read_receipts?: boolean;
  sensitive_content_filter?: boolean;
  personalized_notifications?: boolean;
};

export type AuthState = {
  status: AuthStatus;
  session: Session | null;
  profile: AuthProfile | null;
};

/**
 * Provider responses are uniform: `{ error: string | null }`.
 * The sentinel `__cancelled__` means the user dismissed the native sheet —
 * UI code should NOT show a toast for this; just reset the loading state.
 */
export type ProviderResult = { error: string | null };
export const CANCELLED = '__cancelled__';
