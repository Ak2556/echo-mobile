import { loadTransactions, summarizeExpenses, formatMoney } from './expenses';
import { getStreak, loadHabits, todayStr } from './habits';
import { loadNotes } from './notes';
import { loadMemos, formatMemoTime } from './voiceMemos';

export type LocalProductivityApp = 'notes' | 'habits' | 'expenses' | 'voice-memo';

export interface LocalSearchResult {
  app: LocalProductivityApp;
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

export interface TodayProductivity {
  habits: {
    total: number;
    done: number;
    percent: number;
    remaining: string[];
  };
  notes: {
    total: number;
    recent: Array<{ id: string; title: string }>;
  };
  expenses: {
    income: number;
    expense: number;
    balance: number;
  };
  voiceMemos: {
    total: number;
    recent: Array<{ id: string; title: string; duration: number }>;
  };
}

export async function searchLocalProductivity(query: string, limit = 12): Promise<LocalSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const [notes, habits, txs, memos] = await Promise.all([
    loadNotes(),
    loadHabits(),
    loadTransactions(),
    loadMemos(),
  ]);

  const results: LocalSearchResult[] = [];
  for (const note of notes) {
    if (matches(q, note.title, note.body)) {
      results.push({
        app: 'notes',
        id: note.id,
        title: note.title,
        subtitle: note.body || 'Note',
        route: '/mini-apps/notes',
      });
    }
  }
  for (const habit of habits) {
    if (matches(q, habit.name)) {
      results.push({
        app: 'habits',
        id: habit.id,
        title: `${habit.emoji} ${habit.name}`,
        subtitle: `${getStreak(habit.completedDates)} day streak`,
        route: '/mini-apps/habits',
      });
    }
  }
  for (const tx of txs) {
    if (matches(q, tx.category, tx.note, tx.type)) {
      results.push({
        app: 'expenses',
        id: tx.id,
        title: `${tx.type === 'income' ? '+' : '-'}$${formatMoney(tx.amount)} ${tx.category}`,
        subtitle: tx.note || new Date(tx.date).toLocaleDateString(),
        route: '/mini-apps/expenses',
      });
    }
  }
  for (const memo of memos) {
    if (matches(q, memo.title)) {
      results.push({
        app: 'voice-memo',
        id: memo.id,
        title: memo.title,
        subtitle: `${formatMemoTime(memo.duration)} recording`,
        route: '/mini-apps/voice-memo',
      });
    }
  }

  return results.slice(0, limit);
}

export async function getTodayProductivity(): Promise<TodayProductivity> {
  const [notes, habits, expenseSummary, memos] = await Promise.all([
    loadNotes(),
    loadHabits(),
    summarizeExpenses({ range: 'week' }),
    loadMemos(),
  ]);
  const today = todayStr();
  const done = habits.filter(habit => habit.completedDates.includes(today));
  return {
    habits: {
      total: habits.length,
      done: done.length,
      percent: habits.length ? Math.round((done.length / habits.length) * 100) : 0,
      remaining: habits.filter(habit => !habit.completedDates.includes(today)).map(habit => habit.name),
    },
    notes: {
      total: notes.length,
      recent: notes.slice(0, 3).map(note => ({ id: note.id, title: note.title })),
    },
    expenses: {
      income: expenseSummary.income,
      expense: expenseSummary.expense,
      balance: expenseSummary.balance,
    },
    voiceMemos: {
      total: memos.length,
      recent: memos.slice(0, 3).map(memo => ({ id: memo.id, title: memo.title, duration: memo.duration })),
    },
  };
}

function matches(query: string, ...values: Array<string | undefined>): boolean {
  return values.some(value => value?.toLowerCase().includes(query));
}
