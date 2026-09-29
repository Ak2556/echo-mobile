/**
 * Public API for auth.
 *
 *   import { useAuth, sendEmailOtp, verifyEmailOtp, sendPhoneOtp, verifyPhoneOtp,
 *            signOut, AuthListenerProvider } from '@/lib/auth';
 *
 * Do NOT import from `lib/auth/store`, `lib/auth/listener`, etc. directly —
 * the public surface is just this barrel.
 *
 * Current providers: email OTP (6-digit code), phone OTP, Google OAuth, and
 * Sign in with Apple (native, iOS only).
 */

import { supabase } from '../supabase';
import { clearMessageCache } from '../e2ee/cache';

export { useAuth, useAuthStore } from './store';
export { AuthListenerProvider, refreshAuthSession } from './listener';
export {
  consumeAuthCallbackUrl,
  hasAuthCallbackPayload,
  parseAuthCallbackUrl,
} from './callback';
export { sendEmailOtp, verifyEmailOtp, signInWithReviewerPassword } from './providers/email';
export { sendPhoneOtp, verifyPhoneOtp } from './providers/phone';
export { signInWithGoogle } from './providers/google';
export { signInWithApple, isAppleSignInAvailable } from './providers/apple';
export type { AuthStatus, AuthState, AuthProfile, ProviderResult } from './types';
export { CANCELLED } from './types';

/**
 * Sign out — clears server session AND triggers the SIGNED_OUT event,
 * which the listener uses to clear local stores and route to /auth/login.
 *
 * The device's E2EE key is deliberately left alone. Sealed messages are
 * readable only through that key, so destroying it here made every earlier
 * message permanently unreadable on this phone the next time the same person
 * signed in, and a forced sign-out after a session error did it without the
 * user choosing anything. Leaving it is safe: it is stored per user id, and
 * the wrapped keys it opens are readable only with that user's session
 * (dm_keys_select_own_device). Account deletion is what removes it.
 */
export async function signOut(): Promise<void> {
  clearMessageCache();
  // 'local', not supabase-js's default 'global': signing out here must not
  // revoke the user's sessions on their other devices. The forced sign-out on
  // a broken session (app/_layout.tsx) comes through here too.
  await supabase.auth.signOut({ scope: 'local' });
}
