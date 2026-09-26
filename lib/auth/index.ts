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
import { revokeLocalDevice } from '../e2ee/deviceKeys';
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
 */
export async function signOut(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.id) {
    // Best-effort, and bounded: signing out must work offline. A device that
    // fails to revoke here keeps receiving key rows it can no longer read,
    // which wastes storage but leaks nothing.
    await Promise.race([
      revokeLocalDevice(session.user.id).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 4000)),
    ]);
  }
  clearMessageCache();
  await supabase.auth.signOut();
}
