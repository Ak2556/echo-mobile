/**
 * Compare a secret or signature without leaking it through timing.
 *
 * `a !== b` on strings short-circuits at the first differing byte, so the time
 * it takes is proportional to how much of the secret the caller already has.
 * That turns an unguessable value into one that can be walked a byte at a time.
 * Network jitter makes it impractical over the open internet, but "impractical
 * today" is not a security property, and every one of these call sites is a
 * webhook signature or a shared secret that gates a service-role client.
 *
 * Both inputs are hashed first, so the comparison runs over a fixed 32 bytes
 * regardless of input length — which also removes the length leak that a
 * naive constant-time loop still has.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);

  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= va[i] ^ vb[i];
  return diff === 0;
}
