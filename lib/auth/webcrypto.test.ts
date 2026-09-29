import { describe, expect, it, vi } from 'vitest';
import { createHash, randomFillSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { installSha256Digest, type DigestFn, type RandomValuesFn } from './webcrypto';

const realDigest: DigestFn = async (_algorithm, data) => {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const out = createHash('sha256').update(view).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
};

const realRandom: RandomValuesFn = (array) => randomFillSync(array);

function host(over: Record<string, unknown> = {}) {
  return { TextEncoder, btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'), ...over };
}

describe('installSha256Digest', () => {
  it('installs when the whole S256 path can complete', () => {
    const h = host();
    expect(installSha256Digest(h as never, realDigest, realRandom)).toBe('installed');
    expect(typeof (h as never as { crypto: { subtle: { digest: unknown } } }).crypto.subtle.digest)
      .toBe('function');
  });

  it('declines when btoa is missing, because auth-js calls it unguarded', () => {
    // auth-js checks crypto.subtle and TextEncoder, then calls btoa() on the
    // hash without checking. Installing here would turn a working-but-weak
    // plain challenge into a thrown error — a broken sign-in for everyone.
    const h = host({ btoa: undefined });
    expect(installSha256Digest(h as never, realDigest, realRandom)).toBe('missing-btoa');
    expect((h as { crypto?: unknown }).crypto).toBeUndefined();
  });

  it('declines when TextEncoder is missing', () => {
    const h = host({ TextEncoder: undefined });
    expect(installSha256Digest(h as never, realDigest, realRandom)).toBe('missing-text-encoder');
    expect((h as { crypto?: unknown }).crypto).toBeUndefined();
  });

  it('never overwrites a real WebCrypto implementation', () => {
    const native = { digest: vi.fn() };
    const h = host({ crypto: { subtle: native } });
    expect(installSha256Digest(h as never, realDigest, realRandom)).toBe('already-supported');
    expect((h as never as { crypto: { subtle: unknown } }).crypto.subtle).toBe(native);
  });

  it('preserves other members of an existing crypto object', () => {
    const getRandomValues = vi.fn();
    const h = host({ crypto: { getRandomValues } });
    expect(installSha256Digest(h as never, realDigest, realRandom)).toBe('installed');
    const c = (h as never as { crypto: { getRandomValues: unknown; subtle: unknown } }).crypto;
    expect(c.getRandomValues).toBe(getRandomValues);
    expect(c.subtle).toBeDefined();
  });

  it('hashes exactly as auth-js expects, so the challenge is the real S256', async () => {
    const h = host();
    installSha256Digest(h as never, realDigest, realRandom);
    const subtle = (h as never as { crypto: { subtle: { digest: DigestFn } } }).crypto.subtle;

    // Reproduces generatePKCEChallenge: encode → digest → latin1 → base64url.
    const verifier = 'test-verifier-0123456789';
    const hash = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const latin1 = Array.from(new Uint8Array(hash)).map(c => String.fromCharCode(c)).join('');
    const challenge = (h.btoa as (s: string) => string)(latin1)
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
    // The point of the whole change: challenge must NOT equal the verifier,
    // which is what auth-js uses to decide 'plain' vs 's256'.
    expect(challenge).not.toBe(verifier);
  });

  it('refuses algorithms it was not written for rather than guessing', async () => {
    const h = host();
    installSha256Digest(h as never, realDigest, realRandom);
    const subtle = (h as never as { crypto: { subtle: { digest: DigestFn } } }).crypto.subtle;
    await expect(subtle.digest('SHA-512', new Uint8Array([1]))).rejects.toThrow(/SHA-256 only/);
  });
});

/**
 * The shipped bug: on Hermes there is no global `crypto`, the first version of
 * the shim created one holding only `subtle`, and auth-js then called the
 * missing crypto.getRandomValues on every "Send code". This runs auth-js's
 * own generatePKCEVerifier, unmodified, in a sandbox whose global is exactly
 * what the shim leaves behind on a Hermes-like runtime.
 */
describe('auth-js PKCE verifier on a runtime with no crypto (Hermes)', () => {
  const helpers = createRequire(import.meta.url).resolve('@supabase/auth-js/dist/main/lib/helpers.js');
  const src = readFileSync(helpers, 'utf8');
  const start = src.indexOf('function generatePKCEVerifier()');
  const end = src.indexOf('\n}', start) + 2;
  const generatePKCEVerifier = src.slice(start, end);
  const dec2hex = 'function dec2hex(dec) { return ("0" + dec.toString(16)).substr(-2); }';

  function runVerifierIn(global: Record<string, unknown>): string {
    return runInNewContext(`${dec2hex}\n${generatePKCEVerifier}\ngeneratePKCEVerifier()`, global) as string;
  }

  it('is the unmodified auth-js function', () => {
    expect(generatePKCEVerifier).toMatch(/typeof crypto === 'undefined'/);
    expect(generatePKCEVerifier).toMatch(/crypto\.getRandomValues\(array\)/);
  });

  it('the old shim (subtle only) reproduces the crash', () => {
    const global: Record<string, unknown> = { Uint32Array, Array, Math, TextEncoder, btoa };
    global.crypto = { subtle: { digest: () => undefined } };
    expect(() => runVerifierIn(global)).toThrow(/getRandomValues is not a function|not a function/);
  });

  it('after installing the shim, the verifier is generated from secure random bytes', () => {
    const global: Record<string, unknown> = { Uint32Array, Array, Math, TextEncoder, btoa };
    expect(installSha256Digest(global as never, realDigest, realRandom)).toBe('installed');
    const a = runVerifierIn(global);
    const b = runVerifierIn(global);
    expect(a).toMatch(/^[0-9a-f]{112}$/); // 56 Uint32 values, 2 hex chars each (dec2hex keeps the low byte)
    expect(a).not.toBe(b);
  });

  it('never leaves an existing crypto without getRandomValues either', () => {
    const existing: Record<string, unknown> = {};
    const global: Record<string, unknown> = { Uint32Array, Array, Math, TextEncoder, btoa, crypto: existing };
    installSha256Digest(global as never, realDigest, realRandom);
    expect(typeof existing.getRandomValues).toBe('function');
    expect(() => runVerifierIn(global)).not.toThrow();
  });

  it('keeps a real getRandomValues that is already there', () => {
    const own = (arr: Uint32Array) => arr;
    const global: Record<string, unknown> = { Uint32Array, Array, Math, TextEncoder, btoa, crypto: { getRandomValues: own } };
    installSha256Digest(global as never, realDigest, realRandom);
    expect((global.crypto as { getRandomValues: unknown }).getRandomValues).toBe(own);
  });
});
