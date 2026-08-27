import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';
import { withAuthTimeout } from '../timeout';
import { isValidE164, normalizeE164 } from '../phoneNumber';
import { friendlyAuthError } from '../friendlyAuthError';

/**
 * Phone OTP sign-in.
 *
 *   sendPhoneOtp(phone)            — sends a 6-digit SMS
 *   verifyPhoneOtp(phone, code)    — verifies; on success SIGNED_IN fires
 *
 * Requirements (one-time, user-side):
 *   - Supabase → Auth → Providers → Phone: enabled + Twilio (or other) wired
 *   - India: DLT registration (entity, sender header, message templates).
 *     Indian carriers block unregistered A2P SMS, so this cannot ship until
 *     the operating entity exists.
 *
 * Input is normalised to E.164 here; see ../phoneNumber.
 */

export async function sendPhoneOtp(phone: string): Promise<ProviderResult & { phone: string }> {
  const e164 = normalizeE164(phone);
  // Every OTP is a paid SMS, so reject what cannot be delivered before sending.
  if (!isValidE164(e164)) {
    return { error: 'Enter a valid mobile number.', phone: e164 };
  }
  // Generate fallback metadata to prevent the "Database error saving new user" trigger crash
  const username = `user_${e164.replace(/\D/g, '')}_${Math.floor(Math.random() * 10000)}`;

  const { error } = await withAuthTimeout(
    supabase.auth.signInWithOtp({ 
      phone: e164,
      options: {
        shouldCreateUser: true,
        data: {
          username,
          display_name: 'New User',
        }
      }
    })
  );
  return { error: friendlyAuthError(error?.message), phone: e164 };
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<ProviderResult> {
  const e164 = normalizeE164(phone);
  const cleaned = code.trim();
  if (cleaned.length !== 6) {
    return { error: 'Enter the 6-digit code.' };
  }
  const { error } = await withAuthTimeout(
    supabase.auth.verifyOtp({
      phone: e164,
      token: cleaned,
      type: 'sms',
    }),
  );
  return { error: friendlyAuthError(error?.message) };
}
