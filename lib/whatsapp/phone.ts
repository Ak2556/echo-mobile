/**
 * Turning the many ways an Indian phone number is written into one key.
 *
 * WhatsApp identifies a sender by `wa_id`: digits only, country code included,
 * no plus. Supabase stores a verified phone in `auth.users.phone`, which comes
 * from the OTP flow and may carry a plus, spaces or dashes. Matching an inbound
 * message to an account is comparing those two, so both have to reduce to the
 * same string or a real user silently looks like a stranger.
 *
 * India is the case that needs care: people write the same number as
 * 9876543210, 09876543210, +91 98765 43210 and 91-9876543210, and all four are
 * one person.
 */

/** Default country for bare local numbers. */
const DEFAULT_CC = '91';

/**
 * Reduce a phone number to the digits WhatsApp would use as a wa_id.
 * Returns null when the input cannot be a phone number, rather than a
 * half-normalised string that would match the wrong account.
 */
export function toWaId(input: string | null | undefined, defaultCc = DEFAULT_CC): string | null {
  if (!input) return null;

  let digits = String(input).replace(/[^\d]/g, '');
  if (!digits) return null;

  // 00 is the international prefix in much of the world; WhatsApp does not use it.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // A single leading 0 is the Indian trunk prefix: 09876543210 -> 9876543210.
  // Only stripped when what remains is a plausible local number, so a foreign
  // number that legitimately starts with 0 after its country code survives.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // Bare local number: add the country code.
  if (digits.length === 10) digits = defaultCc + digits;

  // Shorter than a country code plus a subscriber number is not a phone number.
  if (digits.length < 11 || digits.length > 15) return null;

  return digits;
}

/** True when two numbers, written however, are the same number. */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = toWaId(a);
  const right = toWaId(b);
  return left !== null && left === right;
}

/** Display form for a wa_id, so the app can show what it linked. */
export function formatWaId(waId: string): string {
  const digits = waId.replace(/[^\d]/g, '');
  if (digits.length === 12 && digits.startsWith(DEFAULT_CC)) {
    const local = digits.slice(2);
    return `+${DEFAULT_CC} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}
