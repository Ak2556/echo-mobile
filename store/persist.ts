// Sync key/value storage with an MMKV backend in production builds and an
// in-memory fallback in Expo Go (where MMKV's NitroModules can't load).

interface SyncStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

function makeMemoryStorage(): SyncStorage {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => { map.set(k, v); },
    delete: (k) => { map.delete(k); },
    clearAll: () => { map.clear(); },
  };
}

function makeMMKVStorage(): SyncStorage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv');
    const mmkv = new MMKV({ id: 'echo' });
    return {
      getString: (k) => mmkv.getString(k),
      set: (k, v) => mmkv.set(k, v),
      delete: (k) => mmkv.delete(k),
      clearAll: () => mmkv.clearAll(),
    };
  } catch {
    return null;
  }
}

export const storage: SyncStorage = makeMMKVStorage() ?? makeMemoryStorage();

export function persistGet<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function persistSet<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

export function persistDelete(key: string): void {
  storage.delete(key);
}
