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
