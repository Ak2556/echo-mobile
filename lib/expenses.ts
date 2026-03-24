import AsyncStorage from '@react-native-async-storage/async-storage';

export const TX_KEY = 'mini:expenses';
export type TxType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
}

export const EXPENSE_CATS = [
  { label: 'Food', emoji: '🍔' }, { label: 'Transport', emoji: '🚗' },
  { label: 'Shopping', emoji: '🛍' }, { label: 'Health', emoji: '💊' },
  { label: 'Bills', emoji: '📱' }, { label: 'Entertainment', emoji: '🎮' },
  { label: 'Travel', emoji: '✈️' }, { label: 'Other', emoji: '📦' },
];

export const INCOME_CATS = [
  { label: 'Salary', emoji: '💼' }, { label: 'Freelance', emoji: '💻' },
  { label: 'Gift', emoji: '🎁' }, { label: 'Investment', emoji: '📈' },
  { label: 'Other', emoji: '💰' },
];

export async function loadTransactions(): Promise<Transaction[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(TX_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(txs));
}

export async function logExpenseTransaction(input: {
  type?: string;
  amount?: number | string;
  category?: string;
  note?: string;
  date?: string;
}): Promise<Transaction> {
  const type = input.type === 'income' ? 'income' : 'expense';
  const amount = normalizeAmount(input.amount);
  if (!amount || amount <= 0) throw new Error('Transaction amount must be greater than 0');
  const tx: Transaction = {
    id: `${Date.now()}`,
    type,
    amount,
    category: normalizeCategory(type, input.category),
    note: input.note?.trim() ?? '',
    date: normalizeDate(input.date),
  };
  const txs = await loadTransactions();
  await saveTransactions([tx, ...txs]);
  return tx;
}

export interface ExpenseSummary {
  income: number;
  expense: number;
  balance: number;
  byCategory: Array<{ category: string; amount: number; type: TxType }>;
  transactions: Transaction[];
}

export async function summarizeExpenses(input: {
  range?: 'week' | 'month' | 'all';
} = {}): Promise<ExpenseSummary> {
  const txs = await loadTransactions();
  const range = input.range ?? 'week';
  const from = rangeStart(range);
  const transactions = from ? txs.filter(tx => new Date(tx.date) >= from) : txs;
  const income = transactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const expense = transactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
  const categoryMap = new Map<string, { category: string; amount: number; type: TxType }>();
  for (const tx of transactions) {
    const key = `${tx.type}:${tx.category}`;
    const existing = categoryMap.get(key) ?? { category: tx.category, amount: 0, type: tx.type };
    existing.amount += tx.amount;
    categoryMap.set(key, existing);
  }
  return {
    income,
    expense,
    balance: income - expense,
    byCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
    transactions,
  };
}

export function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function categoryEmoji(cat: string) {
  return [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.label === cat)?.emoji ?? '💰';
}

function normalizeAmount(amount?: number | string): number {
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') return parseFloat(amount.replace(/[$,\s]/g, ''));
  return 0;
}

function normalizeCategory(type: TxType, category?: string): string {
  const fallback = 'Other';
  const raw = category?.trim();
  if (!raw) return fallback;
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  return cats.find(cat => cat.label.toLowerCase() === raw.toLowerCase())?.label ?? raw;
}

function normalizeDate(date?: string): string {
  const trimmed = date?.trim();
  if (!trimmed) return new Date().toISOString();
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function rangeStart(range: 'week' | 'month' | 'all'): Date | null {
  if (range === 'all') return null;
  const d = new Date();
  if (range === 'week') d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d;
}
