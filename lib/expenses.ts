import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENCY_MAP, type CurrencyCode } from './currency';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';
import { pushExpensesStructured } from './expensesRemote';
import type { Fact } from './minilink/types';
import { uuidv4 } from '../store/outbox';

export const TX_KEY = 'mini:expenses';
export const DEFAULT_EXPENSE_CURRENCY: CurrencyCode = 'USD';
export type TxType = 'income' | 'expense' | 'sale' | 'purchase' | 'receipt' | 'payment';
export type PartyType = 'customer' | 'supplier';
export type KhataProfile = 'personal' | 'business' | 'farmer';

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone?: string;
  gst?: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
  partyId?: string;
  invoiceNo?: string;
  taxAmount?: number;
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
  parties?: Party[];
  /** monthly spending budget; null = not set */
  budget: number | null;
  /** display currency for this money log */
  currency: CurrencyCode;
  /** user persona mode (determines UI labels and active fields) */
  profile?: KhataProfile;
  /** daily reminder toggle */
  reminders?: boolean;
}

function normalizeCurrency(value: unknown): CurrencyCode {
  return typeof value === 'string' && CURRENCY_MAP.has(value as CurrencyCode)
    ? value as CurrencyCode
    : DEFAULT_EXPENSE_CURRENCY;
}

function coerceDoc(raw: unknown): ExpensesDoc {
  if (Array.isArray(raw)) return { txs: raw as Transaction[], parties: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY, profile: 'business', reminders: false };
  if (raw && typeof raw === 'object') {
    const doc = raw as Partial<ExpensesDoc>;
    return {
      txs: Array.isArray(doc.txs) ? doc.txs : [],
      parties: Array.isArray(doc.parties) ? doc.parties : [],
      budget: typeof doc.budget === 'number' && doc.budget > 0 ? doc.budget : null,
      currency: normalizeCurrency(doc.currency),
      profile: doc.profile || 'business',
      reminders: doc.reminders || false,
    };
  }
  return { txs: [], parties: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY, profile: 'business', reminders: false };
}

export async function loadExpensesDoc(): Promise<ExpensesDoc> {
  const remote = await pullMiniAppIfNewer('expenses');
  if (remote) await AsyncStorage.setItem(TX_KEY, JSON.stringify(coerceDoc(remote)));
  try {
    const doc = coerceDoc(JSON.parse((await AsyncStorage.getItem(TX_KEY)) ?? 'null'));
    if (doc.txs.length) pushExpensesStructured(doc); // backfill for existing users
    return doc;
  } catch {
    return { txs: [], parties: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY, profile: 'business', reminders: false };
  }
}

import { syncExpenseReminders } from './expensesReminders';

export async function saveExpensesDoc(doc: ExpensesDoc): Promise<void> {
  await AsyncStorage.setItem(TX_KEY, JSON.stringify(doc));
  pushMiniApp('expenses', doc);
  pushExpensesStructured(doc);
  syncExpenseReminders(doc.reminders ?? false, doc.profile || 'business');
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
  const esc = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
  const rows = txs.map(tx =>
    [(tx.date || '').slice(0, 10), tx.type || '', esc(tx.category), (tx.amount || 0).toFixed(2), esc(tx.note)].join(','),
  );
  return ['date,type,category,amount,note', ...rows].join('\n');
}

export function pnlToCsv(txs: Transaction[]): string {
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const pnl = income - expense;
  
  const catTotals = new Map<string, number>();
  for (const t of txs) {
    const key = `${t.type}:${t.category}`;
    catTotals.set(key, (catTotals.get(key) ?? 0) + t.amount);
  }
  
  const esc = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
  const lines = ['Profit & Loss Statement', ''];
  lines.push(`Total Income,${income.toFixed(2)}`);
  lines.push(`Total Expenses,${expense.toFixed(2)}`);
  lines.push(`Net Profit/Loss,${pnl.toFixed(2)}`);
  lines.push('');
  lines.push('Category Breakdown');
  lines.push('Category,Type,Amount');
  for (const [key, amt] of catTotals.entries()) {
    const [type, cat] = key.split(':');
    lines.push(`${esc(cat)},${type},${amt.toFixed(2)}`);
  }
  return lines.join('\n');
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daybookToCsv(txs: Transaction[], parties: Party[]): string {
  const esc = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
  const rows = txs.map(tx => {
    const p = parties.find(party => party.id === tx.partyId);
    const particulars = p ? p.name : tx.category;
    const isOut = tx.type === 'expense' || tx.type === 'purchase' || tx.type === 'payment';
    const inAmt = !isOut ? (tx.amount || 0).toFixed(2) : '';
    const outAmt = isOut ? (tx.amount || 0).toFixed(2) : '';
    return [(tx.date || '').slice(0, 10), esc(particulars), tx.type || '', tx.invoiceNo || '', inAmt, outAmt, esc(tx.note)].join(',');
  });
  return ['Date,Particulars,Voucher Type,Invoice No,In (+),Out (-),Note', ...rows].join('\n');
}

export function gstReportToCsv(txs: Transaction[], parties: Party[]): string {
  const esc = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
  const gstTxs = txs.filter(tx => tx.taxAmount && tx.taxAmount > 0);
  const rows = gstTxs.map(tx => {
    const p = parties.find(party => party.id === tx.partyId);
    const gstNo = p?.gst || '';
    return [(tx.date || '').slice(0, 10), esc(tx.invoiceNo || ''), esc(p?.name || ''), esc(gstNo), tx.type, (tx.amount || 0).toFixed(2), (tx.taxAmount || 0).toFixed(2)].join(',');
  });
  return ['Date,Invoice No,Party Name,Party GSTIN,Type,Base Amount,Tax Amount', ...rows].join('\n');
}

export function generatePdfHtml(txs: Transaction[], parties: Party[], currency: string): string {
  const income = txs.filter(t => t.type === 'income' || t.type === 'sale' || t.type === 'receipt').reduce((s, t) => s + (t.amount || 0), 0);
  const expense = txs.filter(t => t.type === 'expense' || t.type === 'purchase' || t.type === 'payment').reduce((s, t) => s + (t.amount || 0), 0);
  const balance = income - expense;
  
  const rowsHtml = txs.map(tx => {
    const p = parties.find(party => party.id === tx.partyId);
    const particulars = p ? p.name : tx.category;
    const isOut = tx.type === 'expense' || tx.type === 'purchase' || tx.type === 'payment';
    return `
      <tr>
        <td>${(tx.date || '').slice(0, 10)}</td>
        <td>${particulars}</td>
        <td>${tx.type}</td>
        <td style="text-align: right; color: #166534;">${!isOut ? tx.amount.toFixed(2) : ''}</td>
        <td style="text-align: right; color: #991b1b;">${isOut ? tx.amount.toFixed(2) : ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
          h1 { color: #111; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; margin-bottom: 30px; }
          .summary { display: flex; gap: 40px; margin-bottom: 40px; padding: 24px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb; }
          .summary-item { display: flex; flex-direction: column; }
          .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 28px; font-weight: 700; color: #111827; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 14px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; background: #f9fafb; }
          tr:last-child td { border-bottom: none; }
        </style>
      </head>
      <body>
        <h1>Account Statement</h1>
        <div class="summary">
          <div class="summary-item">
            <span class="label">Net Balance (${currency})</span>
            <span class="value">${balance.toFixed(2)}</span>
          </div>
          <div class="summary-item">
            <span class="label">Total In</span>
            <span class="value" style="color: #166534;">${income.toFixed(2)}</span>
          </div>
          <div class="summary-item">
            <span class="label">Total Out</span>
            <span class="value" style="color: #991b1b;">${expense.toFixed(2)}</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th>Type</th>
              <th style="text-align: right;">In (+)</th>
              <th style="text-align: right;">Out (-)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;
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

/**
 * Apply a `purchase` fact from another mini-app.
 *
 * Currency is deliberately absent from the payload: ExpensesDoc.currency is
 * the source of truth, so an emitting app cannot mislabel rupees as dollars.
 *
 * Returns the created transaction id, which the bus records in the ledger so
 * the write can be undone and traced back to its source.
 */
export async function logPurchase(f: Fact<'purchase'>): Promise<string> {
  const doc = await loadExpensesDoc();
  const tx: Transaction = {
    id: uuidv4(),
    type: 'expense',
    amount: f.payload.amount,
    category: f.payload.category ?? 'Other',
    note: f.payload.label,
    date: new Date().toISOString().slice(0, 10),
  };
  await saveExpensesDoc({ ...doc, txs: [tx, ...doc.txs] });
  return tx.id;
}

/** Reverse of logPurchase. Unknown ids are a no-op — undo must never throw. */
export async function deletePurchase(createdItemId: string): Promise<void> {
  const doc = await loadExpensesDoc();
  await saveExpensesDoc({ ...doc, txs: doc.txs.filter((t) => t.id !== createdItemId) });
}
