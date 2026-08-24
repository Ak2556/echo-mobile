// Test-only stub for expo-crypto, for the same reason as the secure-store
// stub: the real package needs the Expo native runtime.
//
// Randomness comes from node's own CSPRNG rather than a fixed sequence, so a
// test that accidentally depends on predictable key or IV bytes fails here
// instead of passing for the wrong reason.
import { randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

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
