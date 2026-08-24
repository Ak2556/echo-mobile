// Test-only stub for expo-secure-store. The real package loads
// expo-modules-core / the Expo native runtime, which cannot start under
// vitest/node — importing it fails on `EventEmitter` of undefined.
//
// lib/secureSessionStorage imports it at module load, so anything reaching
// lib/supabase pulls it in. An in-memory keychain is enough: the tests that
// actually exercise the storage adapter mock this module themselves with a
// fixture that can also simulate the keychain being unavailable.
const store = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const WHEN_UNLOCKED = 'WHEN_UNLOCKED';

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string, _options?: unknown): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
