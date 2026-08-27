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

/** Storage adapter for the `auth.storage` option on the Supabase client. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;

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
    if (!aesKey) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    try {
      await AsyncStorage.setItem(key, encrypt(aesKey, value));
    } catch (error) {
      report(error, 'encrypt');
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
