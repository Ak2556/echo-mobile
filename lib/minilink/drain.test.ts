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

/**
 * drain.ts binds findLink at import time, so vi.spyOn on the module object
 * would not intercept it under ESM. Mock the module and toggle the override
 * from the test instead.
 *
 * `failing.on` alone reproduces the brief's five original tests (all of which
 * exercise a single purchase/shopping-list fact). `failTarget` narrows which
 * (kind, from) pair gets the forced-throwing link while `failing.on` is set,
 * which the "one fact failing does not stop the others" test below needs: it
 * puts two different facts through the SAME drainMiniLink() call and needs
 * only one of them to hit a throwing link.
 */
const failing = vi.hoisted(() => ({ on: false }));
const failTarget = vi.hoisted(() => ({ kind: 'purchase', from: 'shopping-list' }));
vi.mock('./links', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./links')>();
  return {
    ...actual,
    findLink: (kind: string, from: string) =>
      failing.on && kind === failTarget.kind && from === failTarget.from
        ? { kind, from, to: 'expenses', apply: () => Promise.reject(new Error('boom')), revert: () => Promise.resolve() }
        : actual.findLink(kind as never, from as never),
  };
});

/**
 * Real regression guard for the per-fact try/catch: the brief's original
 * drainMiniLink already wrapped `link.apply()` in try/catch, so a rejecting
 * apply was never actually unguarded — the genuinely unprotected paths were
 * the two early-exit `removeFact` calls and the unguarded `markFailure` in
 * the catch. `removeFactBoom.id` lets one specific fact's `removeFact` call
 * throw, so a test can drive a fact down an early-exit branch and prove the
 * throw there does not abort delivery of a later fact in the same drain.
 */
const removeFactBoom = vi.hoisted(() => ({ id: '' }));
vi.mock('./queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./queue')>();
  return {
    ...actual,
    removeFact: (id: string) => {
      if (id === removeFactBoom.id) throw new Error('storage boom');
      return actual.removeFact(id);
    },
  };
});

import { emit, listPending, listFailed, resetQueue } from './queue';
import { resetLedger, hasApplied, findByCreatedItem } from './ledger';
import { drainMiniLink, undoFact } from './drain';
import { loadTransactions } from '../expenses';
import { MAX_FACT_ATTEMPTS } from './types';

describe('minilink drain', () => {
  beforeEach(() => {
    storage.clear();
    resetQueue();
    resetLedger();
    failing.on = false;
    failTarget.kind = 'purchase';
    failTarget.from = 'shopping-list';
    removeFactBoom.id = '';
  });

  it('delivers a pending fact to its link and clears it from the queue', async () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 })!;
    await drainMiniLink();
    expect(await loadTransactions()).toHaveLength(1);
    expect(listPending()).toHaveLength(0);
    expect(hasApplied(f.id)).toBe(true);
  });

  it('records provenance so the source app can be named', async () => {
    emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 });
    await drainMiniLink();
    const txId = (await loadTransactions())[0].id;
    expect(findByCreatedItem(txId)?.sourceApp).toBe('shopping-list');
  });

  it('is idempotent — draining twice applies once', async () => {
    emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 });
    await drainMiniLink();
    await drainMiniLink();
    expect(await loadTransactions()).toHaveLength(1);
  });

  it('drops a fact with no matching link instead of retrying forever', async () => {
    emit('bodyStat', 'bmi', 'b-1', { weightKg: 70 });
    await drainMiniLink();
    expect(listPending()).toHaveLength(0);
    expect(listFailed()).toHaveLength(0);
  });

  it('parks a fact as failed after repeated handler errors', async () => {
    failing.on = true;
    emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 });
    for (let i = 0; i < MAX_FACT_ATTEMPTS; i++) await drainMiniLink();
    expect(listFailed()).toHaveLength(1);
  });

  it('undo removes the created row and blocks re-apply on a later drain', async () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 })!;
    await drainMiniLink();
    expect(await undoFact(f.id)).toBe(true);
    expect(await loadTransactions()).toHaveLength(0);
    await drainMiniLink();
    expect(await loadTransactions()).toHaveLength(0);
  });

  it('a rejecting link.apply for one fact does not stop delivery of another', async () => {
    // This is an apply-failure guard, not the per-fact isolation guard: the
    // brief's original drainMiniLink already wrapped link.apply() in
    // try/catch, so this scenario would also pass against the unfixed loop.
    // It still earns its place — it documents that a handler rejection for
    // one fact doesn't block a sibling fact in the same drain — but the test
    // below ("removeFact throwing on an early-exit...") is the one that
    // actually discriminates the fix from the brief's defective loop.
    failTarget.kind = 'bodyStat';
    failTarget.from = 'bmi';
    failing.on = true;

    emit('bodyStat', 'bmi', 'bad', { weightKg: 70 });
    emit('purchase', 'shopping-list', 'good', { label: 'milk', amount: 80 });

    await drainMiniLink();

    const txs = await loadTransactions();
    expect(txs.some((t) => t.note === 'milk')).toBe(true);
    expect(listPending().some((f) => f.sourceItemId === 'bad')).toBe(true);
  });

  it('removeFact throwing on an early-exit does not stop delivery of another fact', async () => {
    // This is the real regression guard for the per-fact try/catch. The
    // brief's original drainMiniLink already caught a rejecting link.apply,
    // so that was never the defect — the two unguarded paths were the
    // early-exit removeFact calls (already-applied, no-link) and the
    // unguarded markFailure in the catch. Here fact A has no matching link,
    // so it takes the no-link early-exit branch and calls removeFact(A.id),
    // which is rigged to throw. Fact B is a normal deliverable purchase,
    // emitted after A so it is processed second in the same drain() call.
    //
    // Against the brief's original loop, A's removeFact throw is outside any
    // try/catch and escapes the whole `for` loop uncaught, so B is never
    // reached and this test fails. Against the fixed loop, A's throw is
    // contained inside the per-fact try, and B still gets delivered.
    const a = emit('bodyStat', 'bmi', 'bad', { weightKg: 70 })!;
    emit('purchase', 'shopping-list', 'good', { label: 'milk', amount: 80 });

    removeFactBoom.id = a.id;
    await drainMiniLink();
    removeFactBoom.id = '';

    const txs = await loadTransactions();
    expect(txs.some((t) => t.note === 'milk')).toBe(true);
  });
});
