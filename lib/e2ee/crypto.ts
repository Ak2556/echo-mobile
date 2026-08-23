/**
 * End-to-end encryption primitives.
 *
 * Deliberately pure and device-free: no SecureStore, no Supabase, no React.
 * Everything here is a function of its arguments, so the whole scheme can be
 * tested against known vectors in Node (see lib/e2ee/crypto.test.ts). The
 * device and network halves live in lib/e2ee/keys.ts and lib/e2ee/messages.ts.
 *
 * SCHEME
 *   messageKey  = random 32 bytes, fresh per message
 *   ciphertext  = secretbox(body, nonce, messageKey)
 *   wrappedKey  = box(messageKey, wrapNonce, recipientPublicKey, senderSecretKey)
 *
 * One message key wrapped once per recipient. A 1:1 chat is the N=1 case of a
 * group, so there is a single code path rather than two.
 *
 * WHY NOT box() THE BODY DIRECTLY
 * That would need the whole body encrypted separately for every recipient. For
 * a ten-person group with a photo caption that is ten copies. Sealing the body
 * once and wrapping only the 32-byte key keeps cost flat in group size.
 *
 * WHAT THIS DOES NOT PROVIDE
 * No forward secrecy: there is no ratchet, so compromising a device private
 * key exposes past messages that device can still see. Signal's Double Ratchet
 * is the answer to that and is a much larger project. This is honest,
 * verifiable content encryption — not a Signal clone — and the product copy
 * must not imply otherwise.
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

export const ENCRYPTION_VERSION = 1;

export interface KeyPair {
  /** Base64 Curve25519 public key. Safe to publish. */
  publicKey: string;
  /** Base64 Curve25519 secret key. Must never leave the device. */
  secretKey: string;
}

export interface WrappedKey {
  recipientId: string;
  wrappedKey: string;
  wrapNonce: string;
  senderPublicKey: string;
}

export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  encryptionVersion: number;
  keys: WrappedKey[];
}

export interface Recipient {
  userId: string;
  publicKey: string;
}

const b64 = naclUtil.encodeBase64;
const fromB64 = naclUtil.decodeBase64;

/** Raised when input is malformed or authentication fails. */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Generate a device keypair.
 *
 * `randomBytes` is injectable because React Native has no native CSPRNG until
 * tweetnacl's PRNG is wired to expo-crypto. Tests pass Node's. Production
 * passes expo-crypto (see keys.ts). There is no default — a silent fallback to
 * a weak source is exactly the bug that must never exist here.
 */
export function generateKeyPair(randomBytes: (n: number) => Uint8Array): KeyPair {
  const seed = randomBytes(nacl.box.secretKeyLength);
  if (seed.length !== nacl.box.secretKeyLength) {
    throw new Error('randomBytes returned the wrong length');
  }
  const pair = nacl.box.keyPair.fromSecretKey(seed);
  return { publicKey: b64(pair.publicKey), secretKey: b64(pair.secretKey) };
}

/**
 * Seal `body` for every recipient.
 *
 * Throws when the recipient list is empty or any recipient has no key, rather
 * than silently sending something unreadable — or worse, falling back to
 * plaintext. Callers must handle this as an error the user can see.
 */
export function encryptForRecipients(
  body: string,
  recipients: Recipient[],
  sender: KeyPair,
  randomBytes: (n: number) => Uint8Array,
): EncryptedMessage {
  if (recipients.length === 0) {
    throw new Error('Refusing to encrypt with no recipients');
  }
  const missing = recipients.filter(r => !r.publicKey);
  if (missing.length) {
    throw new Error(
      `Refusing to send: no encryption key for ${missing.map(m => m.userId).join(', ')}`,
    );
  }

  const messageKey = randomBytes(nacl.secretbox.keyLength);
  const nonce = randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(naclUtil.decodeUTF8(body), nonce, messageKey);

  const senderSecret = fromB64(sender.secretKey);
  const keys: WrappedKey[] = recipients.map(r => {
    const wrapNonce = randomBytes(nacl.box.nonceLength);
    const wrapped = nacl.box(messageKey, wrapNonce, fromB64(r.publicKey), senderSecret);
    return {
      recipientId: r.userId,
      wrappedKey: b64(wrapped),
      wrapNonce: b64(wrapNonce),
      senderPublicKey: sender.publicKey,
    };
  });

  return {
    ciphertext: b64(ciphertext),
    nonce: b64(nonce),
    encryptionVersion: ENCRYPTION_VERSION,
    keys,
  };
}

/**
 * Open a message using this device's wrapped key.
 *
 * Every failure path throws. There is no "return the raw bytes and let the UI
 * decide" — a caller that cannot decrypt must show that the message is
 * unreadable, never guess at its contents.
 */
export function decryptMessage(
  message: { ciphertext: string; nonce: string; encryptionVersion?: number | null },
  own: WrappedKey,
  recipientSecretKey: string,
): string {
  if (message.encryptionVersion != null && message.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new DecryptionError(
      `Unsupported encryption version ${message.encryptionVersion}; this app understands ${ENCRYPTION_VERSION}`,
    );
  }

  let messageKey: Uint8Array | null;
  try {
    messageKey = nacl.box.open(
      fromB64(own.wrappedKey),
      fromB64(own.wrapNonce),
      fromB64(own.senderPublicKey),
      fromB64(recipientSecretKey),
    );
  } catch {
    throw new DecryptionError('Malformed key material');
  }
  if (!messageKey) {
    // Wrong device key, tampered wrapper, or a rotated sender key.
    throw new DecryptionError('Could not unwrap the message key for this device');
  }

  let opened: Uint8Array | null;
  try {
    opened = nacl.secretbox.open(fromB64(message.ciphertext), fromB64(message.nonce), messageKey);
  } catch {
    throw new DecryptionError('Malformed ciphertext');
  }
  if (!opened) {
    throw new DecryptionError('Message failed authentication — it may have been altered');
  }

  return naclUtil.encodeUTF8(opened);
}

/**
 * A short, human-comparable fingerprint of two public keys.
 *
 * Order-independent, so both people see the same digits and can read them to
 * each other. This is the safety number: it is what lets a user verify there
 * is nobody in the middle, and it is the difference between "trust us" and
 * "check for yourself".
 */
export function safetyNumber(publicKeyA: string, publicKeyB: string): string {
  const [first, second] = [publicKeyA, publicKeyB].sort();
  const digest = nacl.hash(naclUtil.decodeUTF8(`${first}|${second}`));
  // 60 bits over 12 digits — enough that a collision cannot be engineered by
  // an attacker who must also produce a usable keypair.
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ((digest[i * 2] << 8 | digest[i * 2 + 1]) % 100000).toString().padStart(5, '0');
  }
  return out.match(/.{1,5}/g)!.join(' ');
}
