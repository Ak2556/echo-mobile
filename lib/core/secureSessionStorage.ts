import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';

/**
 * Encrypted storage for the Supabase session.
 *
 * The session was previously written to AsyncStorage as plaintext JSON, which
 * a file dump off a rooted or jailbroken device reads directly — enough to
 * impersonate the account until the refresh token rotates.
 *
 * It cannot simply move into the Keychain: iOS caps a SecureStore entry at
 * 2 KB and a session carrying provider tokens and user metadata is larger than
 * that, so writes fail silently and nobody stays signed in. The split here is
 * the usual answer — the small secret goes in the Keychain, the large payload
 * stays in AsyncStorage encrypted under it:
 *
 *   SecureStore   32-byte AES key
 *   AsyncStorage  echo.v1:<iv>:<ciphertext>, hex
 *
 * AES-256-GCM comes from @noble/ciphers, which is pure JavaScript. A native
 * crypto module would mean a new prebuild and a new binary for every user; this
 * ships in an OTA update. GCM is authenticated, so tampering fails to decrypt
 * rather than returning altered JSON.
 */

const KEYCHAIN_ENTRY = 'echo.session.key.v1';
export const ENVELOPE_PREFIX = 'echo.v1:';

/** AES-GCM standard nonce length. */
const IV_BYTES = 12;
const KEY_BYTES = 32;

let cachedKey: Uint8Array | null = null;

/**
 * Report without pulling monitoring — and Sentry with it — into the module
 * graph of the launch path. This module is imported before the first render.
 */
function report(error: unknown, op: string): void {
  void import('./monitoring')
    .then(m => m.captureException(error, { tags: { module: 'secureSessionStorage', op } }))
    .catch(() => {});
}

/**
 * The AES key, created on first use.
 *
 * Returns null when the Keychain is unreachable — which happens on iOS
 * simulators without a signing entitlement, where every call throws
 * "Keychain access failed". Callers fall back to storing plaintext there: the
 * alternative is an app that cannot hold a session in development at all.
 */
async function getKey(hasEnvelope = false): Promise<Uint8Array | null> {
  if (cachedKey) return cachedKey;
  try {
    const stored = await SecureStore.getItemAsync(KEYCHAIN_ENTRY);
    if (stored) {
      cachedKey = hexToBytes(stored);
      return cachedKey;
    }

    // No key. On a first run that is expected. With an envelope already in
    // storage it is not: minting a key here orphans that envelope for good,
    // and the user is signed out with a valid session sitting on disk. Mint
    // anyway — the ciphertext is unrecoverable either way — but say so, or
    // the only symptom is "it logged me out again" with nothing to look at.
    if (hasEnvelope) {
      report(
        new Error('session envelope present but keychain key missing — signing out'),
        'key-missing',
      );
    }

    const fresh = getRandomBytes(KEY_BYTES);
    // AFTER_FIRST_UNLOCK, not the default: a token refresh can run while the
    // screen is locked, and the default class would deny the read.
    await SecureStore.setItemAsync(KEYCHAIN_ENTRY, bytesToHex(fresh), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    cachedKey = fresh;
    return cachedKey;
  } catch (error) {
    // Was a bare `catch { return null }`. Every Keychain failure therefore
    // signed the user out invisibly, which is exactly the report that cannot
    // be acted on: no error, no breadcrumb, a valid session still on disk.
    report(error, 'keychain');
    return null;
  }
}

function encrypt(key: Uint8Array, plaintext: string): string {
  const iv = getRandomBytes(IV_BYTES);
  const sealed = gcm(key, iv).encrypt(utf8ToBytes(plaintext));
  return `${ENVELOPE_PREFIX}${bytesToHex(iv)}:${bytesToHex(sealed)}`;
}

function decrypt(key: Uint8Array, envelope: string): string | null {
  const [ivHex, cipherHex] = envelope.slice(ENVELOPE_PREFIX.length).split(':');
  if (!ivHex || !cipherHex) return null;
  return bytesToUtf8(gcm(key, hexToBytes(ivHex)).decrypt(hexToBytes(cipherHex)));
}

/**
 * Keys that must never cost a sign-in when the Keychain is unavailable.
 *
 * supabase-js routes more than the session through `auth.storage`. The PKCE
 * code verifier is written to `${storageKey}-code-verifier` before the
 * authorization request and read back to complete it, through this same
 * adapter. `setItem` below deliberately refuses to write when it has no
 * encryption key — the right call for a long-lived session, and the wrong one
 * here: without the verifier, `verifyOtp` and `exchangeCodeForSession` cannot
 * finish at all, so a Keychain that is merely unavailable turns into sign-in
 * that is impossible, reported as a generic failure.
 *
 * A verifier is single-use, lives for one exchange and is worthless to anyone
 * once spent, so holding it in memory is both sufficient and stricter than
 * disk. Persisting it still happens normally whenever a key exists, because an
 * OAuth round trip through the browser can outlive the process.
 */
function isEphemeralAuthKey(key: string): boolean {
  return key.endsWith('-code-verifier');
}

/** Process-lifetime fallback for the keys above. Never written to disk. */
const ephemeralStore = new Map<string, string>();

/** Storage adapter for the `auth.storage` option on the Supabase client. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) {
      // Nothing on disk. For a verifier that is the expected path when the
      // Keychain was unavailable at write time — fall through to memory.
      return isEphemeralAuthKey(key) ? ephemeralStore.get(key) ?? null : null;
    }

    // Written before this shipped. Return it, then re-write it encrypted —
    // rejecting it would sign out every existing user on upgrade.
    if (!raw.startsWith(ENVELOPE_PREFIX)) {
      void secureSessionStorage.setItem(key, raw);
      return raw;
    }

    const aesKey = await getKey(true);
    // The envelope is encrypted but the key is gone — a restored backup, or
    // cleared Keychain. There is no session to recover; signing in again is
    // the only path, and null is how this adapter says so.
    if (!aesKey) return null;

    try {
      return decrypt(aesKey, raw);
    } catch (error) {
      // Authentication failure on a tampered or truncated payload. Never throw:
      // this runs on the launch path and a throw here is a crash on open.
      report(error, 'decrypt');
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const aesKey = await getKey();
    if (!aesKey && isEphemeralAuthKey(key)) {
      // Hold it in memory instead of refusing. Declining here does not protect
      // anything — the verifier is single-use and spent within the same flow —
      // it only guarantees the sign-in fails. Drop any stale envelope so a
      // later read cannot resurrect a verifier from a previous attempt.
      ephemeralStore.set(key, value);
      await AsyncStorage.removeItem(key);
      return;
    }
    if (!aesKey) {
      // Refuse rather than downgrade. Writing the session unencrypted is the
      // exact thing this module exists to prevent, and the old fallback did it
      // silently — no report on this branch — so an app could sit in plaintext
      // forever with nothing to show for it.
      //
      // Removing the key as well as declining to write it matters: a stale
      // envelope left behind would restore an older session on next launch,
      // which is a worse surprise than signing in again. The user stays signed
      // in for this launch (the session is live in memory) and re-authenticates
      // next time.
      report(new Error('keychain unavailable — refusing to persist session unencrypted'), 'keychain');
      await AsyncStorage.removeItem(key);
      return;
    }
    try {
      await AsyncStorage.setItem(key, encrypt(aesKey, value));
      // The encrypted copy is now authoritative; a memory copy from an earlier
      // attempt, made while the Keychain was down, would otherwise win the next
      // read and replay a spent verifier.
      ephemeralStore.delete(key);
    } catch (error) {
      report(error, 'encrypt');
      await AsyncStorage.removeItem(key);
    }
  },

  async removeItem(key: string): Promise<void> {
    // supabase-js clears the verifier as soon as it is exchanged. Honouring
    // that here is what keeps it single-use in the memory path too.
    ephemeralStore.delete(key);
    await AsyncStorage.removeItem(key);
  },
};
