// In-memory storage shim — compatible with Expo Go (no NitroModules required).
// Swap back to react-native-mmkv after running `expo prebuild` / bare workflow.
const _map = new Map<string, string>();

export const storage = {
  getString: (key: string): string | undefined => _map.get(key),
  set: (key: string, value: string): void => { _map.set(key, value); },
  clearAll: (): void => { _map.clear(); },
};

export function persistGet<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function persistSet<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}
