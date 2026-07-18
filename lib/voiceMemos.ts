import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const MEMOS_KEY = 'mini:memos';

export interface Memo {
  id: string;
  title: string;
  uri: string;
  storagePath?: string;
  duration: number;
  createdAt: string;
}

function normalizeMemos(raw: unknown): Memo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<Memo> => !!item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' && item.id ? item.id : `${Date.now()}`,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Voice memo',
      uri: typeof item.uri === 'string' ? item.uri : '',
      storagePath: typeof item.storagePath === 'string' && item.storagePath ? item.storagePath : undefined,
      duration: Number.isFinite(Number(item.duration)) ? Math.max(0, Number(item.duration)) : 0,
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadMemos(): Promise<Memo[]> {
  const remote = await pullMiniAppIfNewer('voice-memo');
  if (Array.isArray(remote)) {
    const memos = normalizeMemos(remote);
    await AsyncStorage.setItem(MEMOS_KEY, JSON.stringify(memos));
    return memos;
  }
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(MEMOS_KEY)) ?? '[]');
    return normalizeMemos(parsed);
  } catch {
    return [];
  }
}

export async function saveMemos(memos: Memo[]): Promise<void> {
  const next = normalizeMemos(memos);
  await AsyncStorage.setItem(MEMOS_KEY, JSON.stringify(next));
  pushMiniApp('voice-memo', next);
}

export async function renameVoiceMemo(input: {
  id?: string;
  title?: string;
  matchTitle?: string;
}): Promise<Memo> {
  const newTitle = input.title?.trim();
  if (!newTitle) throw new Error('New memo title is required');
  const memos = await loadMemos();
  const memo = findMemo(memos, input);
  if (!memo) throw new Error('No matching voice memo found');
  const updated = { ...memo, title: newTitle };
  await saveMemos(memos.map(m => m.id === memo.id ? updated : m));
  return updated;
}

export async function deleteVoiceMemo(input: {
  id?: string;
  title?: string;
  matchTitle?: string;
}): Promise<Memo> {
  const memos = await loadMemos();
  const memo = findMemo(memos, input);
  if (!memo) throw new Error('No matching voice memo found');
  await saveMemos(memos.filter(m => m.id !== memo.id));
  return memo;
}

export function findMemo(memos: Memo[], input: { id?: string; title?: string; matchTitle?: string }): Memo | undefined {
  if (input.id) return memos.find(memo => memo.id === input.id);
  const query = (input.matchTitle ?? input.title ?? '').trim().toLowerCase();
  if (!query) return undefined;
  return memos.find(memo => memo.title.toLowerCase() === query)
    ?? memos.find(memo => memo.title.toLowerCase().includes(query));
}

export function formatMemoTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatMemoDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
