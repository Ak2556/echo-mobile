import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { installSha256Digest, type DigestFn } from './webcrypto';

const realDigest: DigestFn = async (_algorithm, data) => {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const out = createHash('sha256').update(view).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
};

function host(over: Record<string, unknown> = {}) {
  return { TextEncoder, btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'), ...over };
}

describe('installSha256Digest', () => {
  it('installs when the whole S256 path can complete', () => {
    const h = host();
    expect(installSha256Digest(h as never, realDigest)).toBe('installed');
    expect(typeof (h as never as { crypto: { subtle: { digest: unknown } } }).crypto.subtle.digest)
      .toBe('function');
  });

  it('declines when btoa is missing, because auth-js calls it unguarded', () => {
    // auth-js checks crypto.subtle and TextEncoder, then calls btoa() on the
    // hash without checking. Installing here would turn a working-but-weak
    // plain challenge into a thrown error — a broken sign-in for everyone.
    const h = host({ btoa: undefined });
    expect(installSha256Digest(h as never, realDigest)).toBe('missing-btoa');
    expect((h as { crypto?: unknown }).crypto).toBeUndefined();
  });

  it('declines when TextEncoder is missing', () => {
    const h = host({ TextEncoder: undefined });
    expect(installSha256Digest(h as never, realDigest)).toBe('missing-text-encoder');
    expect((h as { crypto?: unknown }).crypto).toBeUndefined();
  });

  it('never overwrites a real WebCrypto implementation', () => {
    const native = { digest: vi.fn() };
    const h = host({ crypto: { subtle: native } });
    expect(installSha256Digest(h as never, realDigest)).toBe('already-supported');
    expect((h as never as { crypto: { subtle: unknown } }).crypto.subtle).toBe(native);
  });

  it('preserves other members of an existing crypto object', () => {
    const getRandomValues = vi.fn();
    const h = host({ crypto: { getRandomValues } });
    expect(installSha256Digest(h as never, realDigest)).toBe('installed');
    const c = (h as never as { crypto: { getRandomValues: unknown; subtle: unknown } }).crypto;
    expect(c.getRandomValues).toBe(getRandomValues);
    expect(c.subtle).toBeDefined();
  });

  it('hashes exactly as auth-js expects, so the challenge is the real S256', async () => {
    const h = host();
    installSha256Digest(h as never, realDigest);
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
    installSha256Digest(h as never, realDigest);
    const subtle = (h as never as { crypto: { subtle: { digest: DigestFn } } }).crypto.subtle;
    await expect(subtle.digest('SHA-512', new Uint8Array([1]))).rejects.toThrow(/SHA-256 only/);
  });
});
