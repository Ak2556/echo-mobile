/**
 * End-to-end encryption for 1:1 direct messages: the pure core.
 * Spec: docs/superpowers/specs/2026-09-10-dm-e2e-encryption-design.md
 *
 * Nothing in this file touches React Native, the network or storage. Every
 * input is passed in, randomness included, so the scheme is tested under node.
 *
 * Per message: a fresh 32-byte message key (mk) encrypts the body once with
 * XChaCha20-Poly1305. One ephemeral X25519 keypair per message wraps mk to each
 * target device:
 *   shared = X25519(eph_priv, device_pub)
 *   wk     = HKDF-SHA256(shared, salt = eph_pub || device_pub, info = "echo-dm-v1")
 *   wrapped = XChaCha20-Poly1305(wk, mk)
 *
 * Both AEADs carry their context as associated data. The server cannot move a
 * body to another message, conversation or sender, or a wrapped key to another
 * message or device, without authentication failing. A failure always throws;
 * nothing here returns garbage or a partial result.
 *
 * Encoding is lowercase hex, like lib/secureSessionStorage.
 */
import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, bytesToUtf8, concatBytes, equalBytes, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const ENC_VERSION = 1;

export type RandomBytes = (length: number) => Uint8Array;
export type DeviceKeyPair = { publicKey: string; privateKey: string };
export type TargetDevice = { deviceId: string; publicKey: string };
export type MessageContext = { messageId: string; conversationId: string; senderId: string };
export type WrappedKey = { deviceId: string; wrappedKey: string; nonce: string };
export type SealedMessage = {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  encVersion: 1;
  keys: WrappedKey[];
  /** Kept in memory by the sender for edits; never serialized. */
  messageKey: Uint8Array;
};

export type E2EEErrorCode = 'no_target_devices' | 'decrypt_failed' | 'no_key' | 'key_storage_unavailable';

export class E2EEError extends Error {
  constructor(public readonly code: E2EEErrorCode) {
    super(`e2ee:${code}`);
    this.name = 'E2EEError';
  }
}

const INFO = utf8ToBytes('echo-dm-v1');
const KEY_BYTES = 32;
const NONCE_BYTES = 24;

function bodyAad(ctx: MessageContext): Uint8Array {
  return utf8ToBytes(`echo-dm-v1:body:${ctx.messageId}:${ctx.conversationId}:${ctx.senderId}`);
}

function keyAad(messageId: string, deviceId: string): Uint8Array {
  return utf8ToBytes(`echo-dm-v1:key:${messageId}:${deviceId}`);
}

function wrappingKey(shared: Uint8Array, ephemeralPublic: Uint8Array, devicePublic: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concatBytes(ephemeralPublic, devicePublic), INFO, KEY_BYTES);
}

/** Runs an AEAD open; any failure (bad tag, bad hex, bad point) becomes decrypt_failed. */
function opening<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    throw new E2EEError('decrypt_failed');
  }
}

export function generateDeviceKeyPair(random: RandomBytes): DeviceKeyPair {
  const privateKey = random(KEY_BYTES);
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(x25519.getPublicKey(privateKey)) };
}

export function sealMessage(
  plaintext: string,
  ctx: MessageContext,
  targets: TargetDevice[],
  random: RandomBytes,
): SealedMessage {
  const unique = [...new Map(targets.map(t => [t.deviceId, t])).values()];
  if (unique.length === 0) throw new E2EEError('no_target_devices');

  const messageKey = random(KEY_BYTES);
  const nonce = random(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(messageKey, nonce, bodyAad(ctx)).encrypt(utf8ToBytes(plaintext));

  const ephemeralPrivate = random(KEY_BYTES);
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

  const keys = unique.map(t => {
    const devicePublic = hexToBytes(t.publicKey);
    const wk = wrappingKey(x25519.getSharedSecret(ephemeralPrivate, devicePublic), ephemeralPublic, devicePublic);
    const wrapNonce = random(NONCE_BYTES);
    const wrapped = xchacha20poly1305(wk, wrapNonce, keyAad(ctx.messageId, t.deviceId)).encrypt(messageKey);
    return { deviceId: t.deviceId, wrappedKey: bytesToHex(wrapped), nonce: bytesToHex(wrapNonce) };
  });

  return {
    ciphertext: bytesToHex(ciphertext),
    nonce: bytesToHex(nonce),
    ephemeralPublicKey: bytesToHex(ephemeralPublic),
    encVersion: ENC_VERSION,
    keys,
    messageKey,
  };
}

export function openMessageKey(
  wrapped: { wrappedKey: string; nonce: string },
  ephemeralPublicKey: string,
  device: { deviceId: string; keyPair: DeviceKeyPair },
  messageId: string,
): Uint8Array {
  return opening(() => {
    const ephemeralPublic = hexToBytes(ephemeralPublicKey);
    const devicePublic = hexToBytes(device.keyPair.publicKey);
    const shared = x25519.getSharedSecret(hexToBytes(device.keyPair.privateKey), ephemeralPublic);
    const wk = wrappingKey(shared, ephemeralPublic, devicePublic);
    return xchacha20poly1305(wk, hexToBytes(wrapped.nonce), keyAad(messageId, device.deviceId))
      .decrypt(hexToBytes(wrapped.wrappedKey));
  });
}

export function openBody(ciphertext: string, nonce: string, messageKey: Uint8Array, ctx: MessageContext): string {
  return opening(() =>
    bytesToUtf8(xchacha20poly1305(messageKey, hexToBytes(nonce), bodyAad(ctx)).decrypt(hexToBytes(ciphertext))),
  );
}

export function resealBody(
  plaintext: string,
  messageKey: Uint8Array,
  ctx: MessageContext,
  random: RandomBytes,
): { ciphertext: string; nonce: string } {
  const nonce = random(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(messageKey, nonce, bodyAad(ctx)).encrypt(utf8ToBytes(plaintext));
  return { ciphertext: bytesToHex(ciphertext), nonce: bytesToHex(nonce) };
}

/**
 * True only if `messageKeyHex` opens the stored ciphertext to exactly
 * `disclosedText`. A reporter can invent text, but they cannot produce a key
 * that authenticates the sender's stored ciphertext to it.
 */
export function verifyDisclosure(
  disclosedText: string,
  ciphertext: string,
  nonce: string,
  messageKeyHex: string,
  ctx: MessageContext,
): boolean {
  try {
    const opened = openBody(ciphertext, nonce, hexToBytes(messageKeyHex), ctx);
    return equalBytes(utf8ToBytes(opened), utf8ToBytes(disclosedText));
  } catch {
    return false;
  }
}
