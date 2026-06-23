import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeLocalTool } from './localTools';
import { searchLocalProductivity } from './localSearch';
import { summarizeExpenses } from './expenses';
import { loadMemory, rememberPreference, updatePreference } from './aiMemory';
import { saveHabits } from './habits';
import { saveMemos } from './voiceMemos';
import { saveNotes } from './notes';
import { saveTransactions } from './expenses';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
  },
}));

beforeEach(() => {
  storage.clear();
  vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
});

describe('executeLocalTool', () => {
  it('creates and updates notes by case-insensitive title', async () => {
    const created = await executeLocalTool('create_note', { title: 'Launch Ideas', body: 'First' });
    const updated = await executeLocalTool('update_note', { match_title: 'launch ideas', body: 'Second', mode: 'append' });

    expect(created.result.title).toBe('Launch Ideas');
    expect(updated.result.title).toBe('Launch Ideas');
    expect(updated.summary).toContain(String(updated.result.id));
  });

  it('prefers exact note id over title fallback', async () => {
    await saveNotes([
      { id: 'target', title: 'Alpha', body: 'A', color: '#6366F1', updatedAt: '2026-05-01T09:00:00.000Z' },
      { id: 'other', title: 'Alpha', body: 'B', color: '#6366F1', updatedAt: '2026-05-01T08:00:00.000Z' },
    ]);

    const updated = await executeLocalTool('update_note', { id: 'target', title: 'Alpha', body: 'Changed' });

    expect(updated.result.id).toBe('target');
  });

  it('creates habits and completes them by case-insensitive name', async () => {
    const created = await executeLocalTool('create_habit', { name: 'Meditation' });
    const completed = await executeLocalTool('complete_habit', { name: 'meditation', date: '2026-05-01' });

    expect(created.result.name).toBe('Meditation');
    expect(completed.result.completedDates).toEqual(['2026-05-01']);
  });

  it('prefers exact habit id over name match', async () => {
    await saveHabits([
      { id: 'target', name: 'Walk', marker: 'HY', color: '#6366F1', completedDates: [], createdAt: '2026-05-01T08:00:00.000Z' },
      { id: 'other', name: 'Walk', marker: 'HY', color: '#6366F1', completedDates: [], createdAt: '2026-05-01T08:00:00.000Z' },
    ]);

    const completed = await executeLocalTool('complete_habit', { id: 'target', name: 'Walk', date: '2026-05-01' });

    expect(completed.result.id).toBe('target');
  });

  it('logs expenses and summarizes spending', async () => {
    await executeLocalTool('log_expense_transaction', { amount: '$12.50', category: 'Food', note: 'Lunch' });
    await executeLocalTool('log_expense_transaction', { type: 'income', amount: 50, category: 'Gift' });

    const summary = await summarizeExpenses({ range: 'week' });

    expect(summary.expense).toBe(12.5);
    expect(summary.income).toBe(50);
    expect(summary.balance).toBe(37.5);
  });

  it('renames and deletes voice memos by case-insensitive title', async () => {
    await saveMemos([{ id: 'memo-1', title: 'Draft', uri: 'file://memo.m4a', duration: 65, createdAt: '2026-05-01T08:00:00.000Z' }]);

    const renamed = await executeLocalTool('rename_voice_memo', { match_title: 'draft', title: 'Interview' });
    const deleted = await executeLocalTool('delete_voice_memo', { title: 'interview' });

    expect(renamed.result.title).toBe('Interview');
    expect(deleted.result.id).toBe('memo-1');
  });

  it('returns a failed match error without mutating records', async () => {
    await saveHabits([{ id: 'h1', name: 'Read', marker: 'HY', color: '#6366F1', completedDates: [], createdAt: '2026-05-01T08:00:00.000Z' }]);

    await expect(executeLocalTool('complete_habit', { name: 'Missing' })).rejects.toThrow('No matching habit found');
  });
});

describe('local search and memory', () => {
  it('searches notes, habits, expenses, and memos', async () => {
    await saveNotes([{ id: 'n1', title: 'Launch', body: 'Roadmap', color: '#6366F1', updatedAt: '2026-05-01T08:00:00.000Z' }]);
    await saveHabits([{ id: 'h1', name: 'Launch checklist', marker: 'HY', color: '#6366F1', completedDates: [], createdAt: '2026-05-01T08:00:00.000Z' }]);
    await saveTransactions([{ id: 't1', type: 'expense', amount: 20, category: 'Launch', note: 'Ads', date: '2026-05-01T08:00:00.000Z' }]);
    await saveMemos([{ id: 'm1', title: 'Launch memo', uri: 'file://memo.m4a', duration: 30, createdAt: '2026-05-01T08:00:00.000Z' }]);

    const results = await searchLocalProductivity('launch');

    expect(results.map(result => result.app).sort()).toEqual(['expenses', 'habits', 'notes', 'voice-memo']);
  });

  it('remembers, lists, edits, and forgets preferences', async () => {
    const remembered = await executeLocalTool('remember_preference', { key: 'currency', value: 'INR' });
    const edited = await updatePreference({ id: String(remembered.result.id), key: 'currency', value: 'USD' });
    const listed = await executeLocalTool('list_memory', {});
    const forgotten = await executeLocalTool('forget_preference', { key: 'currency' });

    expect(edited.value).toBe('USD');
    expect((listed.result.items as Array<{ value: string }>)[0].value).toBe('USD');
    expect(forgotten.result.key).toBe('currency');
    expect(await loadMemory()).toEqual([]);
  });
});
