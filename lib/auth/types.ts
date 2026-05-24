import type { Session } from '@supabase/supabase-js';

/**
 * Auth status — what should the app render right now?
 *
 *  • `checking`         — initial cold-start, waiting on getSession()
 *  • `signed-out`       — no valid session
 *  • `needs-onboarding` — session exists but profile.username is empty
 *  • `ready`            — session + profile.username present, app can render
 */
export type AuthStatus = 'checking' | 'signed-out' | 'needs-onboarding' | 'ready';

export type AuthProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
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
