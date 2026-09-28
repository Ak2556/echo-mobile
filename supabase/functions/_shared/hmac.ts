// HMAC-SHA256 over a webhook body, with WebCrypto. No imports, so it runs the
// same under Deno and vitest; replaces deno.land/x/crypto, an unmaintained
// 2021 module the webhooks pulled in for this one call.

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}
