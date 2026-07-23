import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENCY_MAP, type CurrencyCode } from './currency';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';
import { pushExpensesStructured } from './expensesRemote';

export const TX_KEY = 'mini:expenses';
export const DEFAULT_EXPENSE_CURRENCY: CurrencyCode = 'USD';
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
  { label: 'Food', marker: 'FD' }, { label: 'Transport', marker: 'TR' },
  { label: 'Shopping', marker: 'SH' }, { label: 'Health', marker: 'HE' },
  { label: 'Bills', marker: 'BI' }, { label: 'Entertainment', marker: 'EN' },
  { label: 'Travel', marker: 'TV' }, { label: 'Other', marker: 'OT' },
];

export const INCOME_CATS = [
  { label: 'Salary', marker: 'SA' }, { label: 'Freelance', marker: 'FR' },
  { label: 'Gift', marker: 'GI' }, { label: 'Investment', marker: 'IN' },
  { label: 'Other', marker: 'OT' },
];

/**
 * The synced document. Historically a bare Transaction[]; now an object so the
 * monthly budget travels with it. Readers accept both shapes.
 */
export interface ExpensesDoc {
  txs: Transaction[];
  /** monthly spending budget; null = not set */
  budget: number | null;
  /** display currency for this money log */
  currency: CurrencyCode;
}

function normalizeCurrency(value: unknown): CurrencyCode {
  return typeof value === 'string' && CURRENCY_MAP.has(value as CurrencyCode)
    ? value as CurrencyCode
    : DEFAULT_EXPENSE_CURRENCY;
}

function coerceDoc(raw: unknown): ExpensesDoc {
  if (Array.isArray(raw)) return { txs: raw as Transaction[], budget: null, currency: DEFAULT_EXPENSE_CURRENCY };
  if (raw && typeof raw === 'object') {
    const doc = raw as Partial<ExpensesDoc>;
    return {
      txs: Array.isArray(doc.txs) ? doc.txs : [],
      budget: typeof doc.budget === 'number' && doc.budget > 0 ? doc.budget : null,
      currency: normalizeCurrency(doc.currency),
    };
  }
  return { txs: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY };
}

export async function loadExpensesDoc(): Promise<ExpensesDoc> {
  const remote = await pullMiniAppIfNewer('expenses');
  if (remote) await AsyncStorage.setItem(TX_KEY, JSON.stringify(coerceDoc(remote)));
  try {
    const doc = coerceDoc(JSON.parse((await AsyncStorage.getItem(TX_KEY)) ?? 'null'));
    if (doc.txs.length) pushExpensesStructured(doc); // backfill for existing users
    return doc;
  } catch {
    return { txs: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY };
  }
}

export async function saveExpensesDoc(doc: ExpensesDoc): Promise<void> {
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(doc));
  pushMiniApp('expenses', doc);
  pushExpensesStructured(doc);
}

export async function loadTransactions(): Promise<Transaction[]> {
  return (await loadExpensesDoc()).txs;
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  const doc = await loadExpensesDoc();
  await saveExpensesDoc({ ...doc, txs });
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

/** 'YYYY-MM' bucket for a transaction date. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey(): string {
  return monthKey(new Date().toISOString());
}

export function transactionsToCsv(txs: Transaction[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = txs.map(tx =>
    [tx.date.slice(0, 10), tx.type, esc(tx.category), tx.amount.toFixed(2), esc(tx.note)].join(','),
  );
  return ['date,type,category,amount,note', ...rows].join('\n');
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function categoryMarker(cat: string) {
  return [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.label === cat)?.marker ?? 'OT';
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
