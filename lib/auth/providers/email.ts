import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';
import { withAuthTimeout } from '../timeout';

/**
 * Email OTP sign-in.
 *
 *   sendEmailOtp(email)            — sends a 6-digit code to the inbox
 *   verifyEmailOtp(email, code)    — verifies; on success SIGNED_IN fires
 *
 * No magic links, no deep-link handling, no email-scanner token theft.
 * The user types the code directly in the app — same UX as phone OTP.
 *
 * Requirements (one-time, Supabase dashboard):
 *   - Auth → Providers → Email: "Confirm email" may remain on; OTP codes
 *     work regardless of whether magic links are also enabled.
 */

export async function sendEmailOtp(email: string): Promise<ProviderResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Enter a valid email address.' };
  }
  const { error } = await withAuthTimeout(
    supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    }),
  );
  return { error: error?.message ?? null };
}

export async function verifyEmailOtp(email: string, code: string): Promise<ProviderResult> {
  const trimmed = email.trim().toLowerCase();
  const cleaned = code.trim();
  if (cleaned.length !== 6) {
    return { error: 'Enter the 6-digit code.' };
  }
  const { error } = await withAuthTimeout(
    supabase.auth.verifyOtp({
      email: trimmed,
      token: cleaned,
      type: 'email',
    }),
  );
  return { error: error?.message ?? null };
}

/**
 * App Store reviewer bypass.
 * Signs in with a pre-created demo account using password auth.
 * The demo account must be created in Supabase with email+password enabled.
 *
 * Credentials are intentionally in the client bundle — this is a demo account
 * with no real user data. Set EXPO_PUBLIC_DEMO_EMAIL + EXPO_PUBLIC_DEMO_PASSWORD
 * as EAS secrets before the production build.
 */
export async function signInAsDemo(): Promise<ProviderResult> {
  const email = process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '';
  const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';
  if (!email || !password) {
    return { error: 'Demo account not configured.' };
  }
  const { error } = await withAuthTimeout(
    supabase.auth.signInWithPassword({ email, password }),
  );
  return { error: error?.message ?? null };
}
