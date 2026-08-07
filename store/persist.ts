// Sync key/value storage. MMKV in production builds; when MMKV can't load
// (Expo Go, or a build where the NitroModule didn't link) we fall back to a
// synchronous in-memory cache that WRITES THROUGH to AsyncStorage — so settings
// still survive a restart instead of silently resetting to defaults.

interface SyncStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clearAll: () => void;
}

interface AsyncBackedStorage extends SyncStorage {
  /** Seed the cache from a hydration read without echoing back to AsyncStorage. */
  _seed: (key: string, value: string) => void;
}

const ASYNC_PREFIX = 'echo:';

// Lazily resolved so importing this module never pulls the native module (safe
// in node/test envs); null when AsyncStorage isn't available (then the cache is
// just in-memory, same as before).
interface AsyncKV {
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
  multiRemove: (ks: string[]) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
  multiGet: (ks: readonly string[]) => Promise<readonly [string, string | null][]>;
}
let _asyncStore: AsyncKV | null | undefined;
function asyncStore(): AsyncKV | null {
  if (_asyncStore === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _asyncStore = require('@react-native-async-storage/async-storage').default as AsyncKV;
    } catch { _asyncStore = null; }
  }
  return _asyncStore;
}

function makeAsyncBackedStorage(): AsyncBackedStorage {
  const cache = new Map<string, string>();
  return {
    getString: (k) => cache.get(k),
    set: (k, v) => { cache.set(k, v); void asyncStore()?.setItem(ASYNC_PREFIX + k, v).catch(() => {}); },
    delete: (k) => { cache.delete(k); void asyncStore()?.removeItem(ASYNC_PREFIX + k).catch(() => {}); },
    clearAll: () => {
      const keys = [...cache.keys()];
      cache.clear();
      void asyncStore()?.multiRemove(keys.map((k) => ASYNC_PREFIX + k)).catch(() => {});
    },
    _seed: (k, v) => { cache.set(k, v); },
  };
}

function makeMMKVStorage(): SyncStorage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv');
    const mmkv = new MMKV({ id: 'echo' });
    // Touch it once so a lazy/broken native binding fails here (→ fallback)
    // rather than silently later.
    mmkv.getString('__probe__');
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

const mmkv = makeMMKVStorage();
const asyncBacked = mmkv ? null : makeAsyncBackedStorage();

/** True when running on the AsyncStorage fallback (MMKV unavailable). */
export const storageIsAsyncFallback = !mmkv;

export const storage: SyncStorage = mmkv ?? (asyncBacked as SyncStorage);

/**
 * Load the AsyncStorage snapshot into the sync cache. No-op when MMKV is active
 * (MMKV is already synchronous + durable). Call once at startup, then re-read
 * persisted state (see the store's rehydrate). Best-effort.
 */
export async function storageHydrate(): Promise<void> {
  const AS = asyncStore();
  if (!asyncBacked || !AS) return;
  try {
    const keys = (await AS.getAllKeys()).filter((k) => k.startsWith(ASYNC_PREFIX));
    if (keys.length === 0) return;
    const pairs = await AS.multiGet(keys);
    for (const [k, v] of pairs) if (v != null) asyncBacked._seed(k.slice(ASYNC_PREFIX.length), v);
  } catch { /* ignore */ }
}

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
