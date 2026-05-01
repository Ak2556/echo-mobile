import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY_KEY = 'echo-ai/local-memory';

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  createdAt: string;
}

export async function loadMemory(): Promise<MemoryItem[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(MEMORY_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMemory(items: MemoryItem[]): Promise<void> {
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(items));
}

export async function rememberPreference(input: { key?: string; value?: string }): Promise<MemoryItem> {
  const key = input.key?.trim();
  const value = input.value?.trim();
  if (!key || !value) throw new Error('Memory key and value are required');
  const items = await loadMemory();
  const existing = items.find(item => item.key.toLowerCase() === key.toLowerCase());
  const next: MemoryItem = {
    id: existing?.id ?? `${Date.now()}`,
    key,
    value,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await saveMemory(existing ? items.map(item => item.id === existing.id ? next : item) : [next, ...items]);
  return next;
}

export async function forgetPreference(input: { id?: string; key?: string }): Promise<MemoryItem> {
  const items = await loadMemory();
  const item = input.id
    ? items.find(memory => memory.id === input.id)
    : items.find(memory => memory.key.toLowerCase() === input.key?.trim().toLowerCase());
  if (!item) throw new Error('No matching memory found');
  await saveMemory(items.filter(memory => memory.id !== item.id));
  return item;
}

export async function clearMemory(): Promise<number> {
  const items = await loadMemory();
  await saveMemory([]);
  return items.length;
}
