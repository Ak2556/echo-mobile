import AsyncStorage from '@react-native-async-storage/async-storage';

// Most-recently-opened mini apps, newest first. Local-only (device usage
// isn't worth syncing) and best-effort — a failed read just means no
// "Jump back in" row, never a broken screen.

const KEY = 'mini:recents';
const MAX = 8;

export async function recordToolOpen(id: string): Promise<void> {
  try {
    const list = await getRecentTools();
    const next = [id, ...list.filter(x => x !== id)].slice(0, MAX);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore — recents are a convenience, not load-bearing
  }
}

export async function getRecentTools(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
