// RevenueCat's webhook signature, as documented:
//
//   X-RevenueCat-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
//
// computed over "<t>.<raw body>" with the integration's signing secret, and
// recomputed on every delivery attempt. The previous check read a header
// named x-revenuecat-signature and computed SHA-512 over the body alone, so no
// genuine delivery could ever have passed it.

import { hmacSha256Hex } from '../_shared/hmac.ts';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

/** How far t may be from now: clock skew plus one POST, not a replay window. */
export const TOLERANCE_SECONDS = 300;

export type SignatureCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

export async function verifyRevenueCatSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number,
): Promise<SignatureCheck> {
  if (!header || !secret) return { ok: false, reason: 'missing' };
  const parts = new Map<string, string>();
  for (const piece of header.split(',')) {
    const i = piece.indexOf('=');
    if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
  }
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1') ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return (await timingSafeEqual(expected, v1.toLowerCase())) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
