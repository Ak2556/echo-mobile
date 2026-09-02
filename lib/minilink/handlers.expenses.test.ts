import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * lib/expenses pulls in miniAppSync -> supabase -> react-native-url-polyfill,
 * none of which load under node. This preamble is copied from the working one
 * in lib/localTools.test.ts — do not trim it down to "just AsyncStorage" or
 * the module will fail to import.
 */
const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (v: Record<string, unknown>) => v.ios ?? v.default },
  NativeModules: { BlobModule: {} },
  AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Share: { share: vi.fn(() => Promise.resolve({ action: 'sharedAction' })) },
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((k: string) => Promise.resolve(storage.get(k) ?? null)),
    setItem: vi.fn((k: string, v: string) => { storage.set(k, v); return Promise.resolve(); }),
    removeItem: vi.fn((k: string) => { storage.delete(k); return Promise.resolve(); }),
    clear: vi.fn(() => { storage.clear(); return Promise.resolve(); }),
  },
}));

import { logPurchase, deletePurchase, loadExpensesDoc, saveExpensesDoc, loadTransactions } from '../expenses';
import type { Fact } from './types';

const fact = (over: Partial<Fact<'purchase'>> = {}): Fact<'purchase'> => ({
  id: 'fact-1',
  kind: 'purchase',
  source: 'shopping-list',
  sourceItemId: 'item-1',
  at: Date.now(),
  payload: { label: 'milk', amount: 80, category: 'Dairy' },
  attempts: 0,
  status: 'pending',
  ...over,
});

describe('expenses fact handler', () => {
  beforeEach(() => { storage.clear(); });

  it('logs a purchase as an expense transaction and returns its id', async () => {
    const id = await logPurchase(fact());
    const txs = await loadTransactions();
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe(id);
    expect(txs[0].type).toBe('expense');
    expect(txs[0].amount).toBe(80);
    expect(txs[0].note).toBe('milk');
    expect(txs[0].category).toBe('Dairy');
  });

  it('falls back to Other when the payload has no category', async () => {
    await logPurchase(fact({ payload: { label: 'thing', amount: 5 } }));
    const txs = await loadTransactions();
    expect(txs[0].category).toBe('Other');
  });

  it('leaves the doc currency alone — the consuming app owns currency', async () => {
    const before = await loadExpensesDoc();
    await saveExpensesDoc({ ...before, currency: 'INR' });
    await logPurchase(fact());
    expect((await loadExpensesDoc()).currency).toBe('INR');
  });

  it('deletePurchase removes exactly the row it created', async () => {
    const id = await logPurchase(fact());
    await logPurchase(fact({ id: 'fact-2', payload: { label: 'bread', amount: 40 } }));
    await deletePurchase(id);
    const txs = await loadTransactions();
    expect(txs).toHaveLength(1);
    expect(txs[0].note).toBe('bread');
  });

  it('deletePurchase on an unknown id is a no-op, not a throw', async () => {
    await logPurchase(fact());
    await expect(deletePurchase('nope')).resolves.toBeUndefined();
    expect(await loadTransactions()).toHaveLength(1);
  });
});
