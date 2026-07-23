// Best-effort structured mirror of the local ExpensesDoc into expense_tx /
// expense_settings. Local blob stays authoritative for the offline UI; this
// keeps the server's queryable copy in sync for insights, AI, and budget
// notifications. Never throws.

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import type { ExpensesDoc } from './expenses';

const day = (s: string) => (s || new Date().toISOString()).slice(0, 10);
const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function pushExpensesStructured(doc: ExpensesDoc): void {
  void (async () => {
    try {
      if (!isSupabaseRemote()) return;
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

      const rows = doc.txs.map(tx => ({
        user_id: uid,
        client_id: tx.id,
        type: tx.type,
        amount: tx.amount,
        category: tx.category,
        note: tx.note ?? null,
        date: day(tx.date),
      }));
      if (rows.length) {
        await supabase.from('expense_tx').upsert(rows, { onConflict: 'user_id,client_id' });
        const ids = rows.map(r => csv(r.client_id)).join(',');
        await supabase.from('expense_tx').delete().eq('user_id', uid).not('client_id', 'in', `(${ids})`);
      } else {
        await supabase.from('expense_tx').delete().eq('user_id', uid);
      }

      await supabase.from('expense_settings').upsert({
        user_id: uid,
        budget: doc.budget ?? null,
        currency: doc.currency,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch {
      // best-effort; local + blob sync remain authoritative
    }
  })();
}

export interface ExpenseStat {
  incomeMonth: number;
  expenseMonth: number;
  netMonth: number;
  txCount: number;
  budget: number | null;
  currency: string | null;
}

export async function fetchExpenseStats(): Promise<ExpenseStat | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const { data, error } = await supabase.rpc('expense_stats');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return null;
    return {
      incomeMonth: Number(row.income_month) || 0,
      expenseMonth: Number(row.expense_month) || 0,
      netMonth: Number(row.net_month) || 0,
      txCount: Number(row.tx_count) || 0,
      budget: row.budget != null ? Number(row.budget) : null,
      currency: (row.currency as string) ?? null,
    };
  } catch {
    return null;
  }
}
