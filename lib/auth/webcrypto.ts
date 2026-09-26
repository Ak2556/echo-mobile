import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

/**
 * Restore SHA-256 PKCE challenges on native.
 *
 * `lib/supabase.ts` sets `flowType: 'pkce'` for a specific reason: under the
 * implicit flow the provider returns the access AND refresh tokens in the
 * redirect fragment, and `echo://auth/callback` is a custom scheme that no app
 * owns — anything on the device can register it and walk off with a refresh
 * token. PKCE replaces that with a single-use code.
 *
 * But Hermes ships no `crypto.subtle`, and @supabase/auth-js degrades quietly
 * when it is absent:
 *
 *     WebCrypto API is not supported. Code challenge method will default to
 *     use plain instead of sha256.
 *
 * (Five of those in one launch of the dev client.) With `plain` the challenge
 * IS the verifier, so PKCE stops being a proof of possession and the defence it
 * was configured for is largely gone. The exchange is still single-use, which
 * is why this is a weakening rather than a hole — but it is a weakening of the
 * one thing the custom scheme made necessary.
 *
 * expo-crypto's `digest` is a native SHA-256 over a byte view, which is exactly
 * the shape `crypto.subtle.digest('SHA-256', …)` is called with in auth-js.
 *
 * ## Why this installs conditionally
 *
 * auth-js gates on `crypto.subtle` and `TextEncoder`, then calls `btoa` on the
 * result without checking for it. Installing `subtle` where `btoa` is missing
 * would move that path from "works, weakly" to "throws", turning a downgrade
 * into a broken sign-in for everyone. So both prerequisites are verified first
 * and the shim declines to install unless the whole S256 path can complete.
 * Declining leaves behaviour exactly as it is today.
 */

export type DigestFn = (algorithm: string, data: BufferSource) => Promise<ArrayBuffer>;

export type InstallOutcome =
  | 'installed'
  | 'already-supported'
  | 'missing-text-encoder'
  | 'missing-btoa';

type CryptoHost = {
  crypto?: { subtle?: { digest?: unknown } };
  TextEncoder?: unknown;
  btoa?: unknown;
};

/**
 * Attach a SHA-256 `crypto.subtle.digest` to `host`, if and only if doing so
 * makes the full challenge path work. Exported with its dependencies injected
 * so the decision table is testable without a native runtime.
 */
export function installSha256Digest(host: CryptoHost, digestImpl: DigestFn): InstallOutcome {
  if (typeof host.crypto?.subtle?.digest === 'function') return 'already-supported';
  if (typeof host.TextEncoder === 'undefined') return 'missing-text-encoder';
  if (typeof host.btoa !== 'function') return 'missing-btoa';

  const subtle = {
    digest(algorithm: string | { name?: string }, data: BufferSource): Promise<ArrayBuffer> {
      const name = typeof algorithm === 'string' ? algorithm : algorithm?.name ?? '';
      if (name.toUpperCase() !== 'SHA-256') {
        // Deliberately narrow. Anything else reaching this shim is a caller we
        // did not write for, and a wrong-but-plausible hash is worse than a
        // throw that names itself.
        return Promise.reject(new Error(`webcrypto shim supports SHA-256 only, got "${name}"`));
      }
      return digestImpl(CryptoDigestAlgorithm.SHA256, data);
    },
  };

  const existing = host.crypto;
  if (existing) (existing as { subtle?: unknown }).subtle = subtle;
  else host.crypto = { subtle };

  return 'installed';
}

/** Install against the real runtime. Import for side effects before createClient. */
export const webCryptoOutcome: InstallOutcome = installSha256Digest(
  globalThis as unknown as CryptoHost,
  (algorithm, data) => digest(algorithm as CryptoDigestAlgorithm, data),
);
