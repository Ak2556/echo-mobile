import AsyncStorage from '@react-native-async-storage/async-storage';

export const MEMOS_KEY = 'mini:memos';

export interface Memo {
  id: string;
  title: string;
  uri: string;
  duration: number;
  createdAt: string;
}

export async function loadMemos(): Promise<Memo[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(MEMOS_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMemos(memos: Memo[]): Promise<void> {
  await AsyncStorage.setItem(MEMOS_KEY, JSON.stringify(memos));
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
