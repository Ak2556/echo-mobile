/**
 * Phone number normalisation to E.164.
 *
 * Kept separate from ./providers/phone so it can be tested without pulling in
 * the Supabase client and its native storage dependency.
 *
 * Echo is India-first, so an unqualified number is Indian. The previous
 * implementation assumed +1, which meant a user typing their number the way
 * they would say it out loud got a US number:
 *
 *     9876543210   -> +19876543210    (US)
 *     09876543210  -> +09876543210    (not valid E.164 at all)
 *
 * An explicit country code always wins, so this stays correct for the 13
 * non-Indian languages the app ships.
 */

/** India. Callers can override per-region if Echo ever defaults elsewhere. */
export const DEFAULT_COUNTRY_CODE = '91';

/**
 * Convert user input to E.164 (+<country><national>).
 *
 * Accepts the forms people actually type: spaced, hyphenated, bracketed, with
 * a trunk '0', with a '00' international prefix, or already qualified with '+'.
 * Returns '' for input containing no digits.
 */
export function normalizeE164(phone: string, defaultCc: string = DEFAULT_COUNTRY_CODE): string {
  const cleaned = (phone ?? '').trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';

  // Already international.
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  // '00' is the international access prefix dialled from India and much of the
  // EU — 00 91 98765 43210 is the same number as +91 98765 43210.
  if (cleaned.startsWith('00')) {
    const digits = cleaned.slice(2).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  // Already carries the country code without a '+' (919876543210).
  if (digits.length > 10 && digits.startsWith(defaultCc)) {
    return `+${digits}`;
  }

  // Strip the trunk prefix people use when dialling domestically.
  const national = digits.replace(/^0+/, '');
  if (!national) return '';

  return `+${defaultCc}${national}`;
}

/**
 * Whether a normalised number is plausibly dialable.
 *
 * Checked before sending, because every OTP is a paid SMS and a malformed
 * number spends money to deliver nothing.
 */
export function isValidE164(e164: string): boolean {
  // E.164 allows at most 15 digits, and no country code starts with 0.
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return false;

  // Indian mobile numbers are exactly 10 digits and begin 6-9. Landlines
  // cannot receive SMS, so rejecting them here gives a better error than a
  // silent non-delivery would.
  if (e164.startsWith(`+${DEFAULT_COUNTRY_CODE}`)) {
    return /^[6-9]\d{9}$/.test(e164.slice(1 + DEFAULT_COUNTRY_CODE.length));
  }

  return true;
}
