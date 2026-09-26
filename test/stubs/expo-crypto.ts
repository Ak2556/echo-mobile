// Test-only stub for expo-crypto, for the same reason as the secure-store
// stub: the real package needs the Expo native runtime.
//
// Randomness comes from node's own CSPRNG rather than a fixed sequence, so a
// test that accidentally depends on predictable key or IV bytes fails here
// instead of passing for the wrong reason.
import { createHash, randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

/** Mirrors expo-crypto: the enum members are the algorithm strings themselves. */
export enum CryptoDigestAlgorithm {
  SHA1 = 'SHA-1',
  SHA256 = 'SHA-256',
  SHA384 = 'SHA-384',
  SHA512 = 'SHA-512',
}

/**
 * Real hashing, not a canned value. This backs the WebCrypto shim that restores
 * S256 for PKCE, and a fake digest there would let a wiring bug — wrong
 * algorithm, wrong byte view — pass the suite and reach production as a silently
 * wrong code challenge.
 */
export async function digest(
  algorithm: CryptoDigestAlgorithm,
  data: BufferSource,
): Promise<ArrayBuffer> {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
  const hashed = createHash(algorithm.replace('-', '').toLowerCase()).update(view).digest();
  return hashed.buffer.slice(hashed.byteOffset, hashed.byteOffset + hashed.byteLength) as ArrayBuffer;
}

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return getRandomBytes(byteCount);
}

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  const bytes = randomBytes(array.byteLength);
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
  return array;
}

export function randomUUID(): string {
  return nodeRandomUUID();
}
