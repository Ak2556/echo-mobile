import { supabase } from '../../supabase';
import type { ProviderResult } from '../types';
import { withAuthTimeout } from '../timeout';

/**
 * Phone OTP sign-in.
 *
 *   sendPhoneOtp(phone)            — sends a 6-digit SMS
 *   verifyPhoneOtp(phone, code)    — verifies; on success SIGNED_IN fires
 *
 * Requirements (one-time, user-side):
 *   - Supabase → Auth → Providers → Phone: enabled + Twilio (or other) wired
 *
 * Caller is responsible for normalizing the phone to E.164 (+15551234567).
 */

function normalizeE164(phone: string): string {
  const trimmed = phone.trim();
  // If it already starts with +, keep as-is (just strip spaces/dashes).
  if (trimmed.startsWith('+')) return trimmed.replace(/[\s\-()]/g, '');
  // Otherwise strip non-digits and assume US country code as a fallback.
  const digits = trimmed.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export async function sendPhoneOtp(phone: string): Promise<ProviderResult & { phone: string }> {
  const e164 = normalizeE164(phone);
  if (e164.length < 8) {
    return { error: 'Enter a valid phone number.', phone: e164 };
  }
  const { error } = await withAuthTimeout(supabase.auth.signInWithOtp({ phone: e164 }));
  return { error: error?.message ?? null, phone: e164 };
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
  return { error: error?.message ?? null };
}
