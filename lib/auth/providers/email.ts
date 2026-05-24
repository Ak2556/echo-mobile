import * as Linking from 'expo-linking';
import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';

/**
 * Email magic-link sign-in.
 *
 * Replaces the email+password flow entirely. Supabase emails a one-tap link
 * that opens `echo://auth/callback?code=…` — the deep-link handler in
 * lib/auth/listener.ts consumes the code via exchangeCodeForSession and the
 * normal SIGNED_IN event takes over.
 *
 * Requirements (one-time, user-side):
 *   - Supabase → Auth → Providers → Email: enable "Magic Link"
 *   - Supabase → Auth → URL Configuration → add `echo://auth/callback`
 *     to the Redirect URLs allowlist
 *
 * No password screens, no reset flow, no email-confirmation screen. The
 * magic link IS the verification.
 */
export async function sendMagicLink(email: string): Promise<ProviderResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { error: 'Enter a valid email address.' };
  }

  const redirectTo = Linking.createURL('auth/callback');

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: redirectTo,
      // shouldCreateUser defaults to true — this is BOTH signin and signup.
    },
  });

  return { error: error?.message ?? null };
}
