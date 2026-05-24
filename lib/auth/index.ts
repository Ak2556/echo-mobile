/**
 * Public API for auth.
 *
 *   import { useAuth, signInWithGoogle, sendMagicLink,
 *            sendPhoneOtp, verifyPhoneOtp, signOut,
 *            AuthListenerProvider } from '@/lib/auth';
 *
 * Do NOT import from `lib/auth/store`, `lib/auth/listener`, etc. directly —
 * the public surface is just this barrel.
 *
 * v1 providers: Google (native), email magic-link, phone OTP.
 * Apple Sign-In is intentionally out of scope for v1 — see commit history
 * for the original provider implementation if you re-add it post-launch.
 */

import { supabase } from '../supabase';

export { useAuth, useAuthStore } from './store';
export { AuthListenerProvider } from './listener';
export {
  consumeAuthCallbackUrl,
  hasAuthCallbackPayload,
  parseAuthCallbackUrl,
} from './callback';
export { signInWithGoogle } from './providers/google';
export { sendMagicLink } from './providers/email';
export { sendPhoneOtp, verifyPhoneOtp } from './providers/phone';
export type { AuthStatus, AuthState, AuthProfile, ProviderResult } from './types';
export { CANCELLED } from './types';

/**
 * Sign out — clears server session AND triggers the SIGNED_OUT event,
 * which the listener uses to clear local stores and route to /auth/login.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
