# Mini-app Interconnection — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checking off a shopping-list item logs it as an expense, with an Undo toast and a provenance trail, delivered through a durable queue that survives app-kill.

**Architecture:** A "fact" (something that happened in one app, stated so another can understand it) is enqueued to a persisted queue modelled on `store/outbox.ts`. A drain loop started from `app/_layout.tsx` looks each fact up in a declarative link table and calls the consuming app's handler. A ledger keyed by fact id gives idempotency and provenance, so no existing mini-app type changes and all 22 screens compile untouched.

**Tech Stack:** TypeScript, Zustand, `store/persist.ts` (MMKV with AsyncStorage fallback), vitest (`logic` project, node environment).

**Spec:** `docs/superpowers/specs/2026-09-03-mini-app-interconnection-design.md`

## Global Constraints

- **Scope is Phase 1 only:** bus core, ledger, Toast action, and exactly one link (shopping-list → expenses). Phases 2 and 3 are separate plans. Do not add links.
- **No existing mini-app type changes.** `Transaction`, `ShoppingItem` and the other item interfaces are not modified. Provenance lives in the ledger.
- **Emitting is fire-and-forget.** `emit()` must never throw into a caller's UI and never block a save.
- **Idempotency is enforced by the store, not the handler.** A fact id already present in the ledger must never apply twice.
- **Device-local only.** Facts never sync across devices.
- **Currency is owned by the consuming app.** `ExpensesDoc.currency` is the source of truth; the `purchase` payload carries no currency field. This deviates from the spec's payload definition, deliberately — the spec's "every emitter must pass real currency" prerequisite is resolved by having no emitter pass it at all.
- **Tests run in the `logic` vitest project** (`npx vitest run <file> --project logic`), node environment, `*.test.ts` only.
- **Storage keys** use the existing `mini:` / `_v1` conventions: `minilink_facts_v1`, `minilink_ledger_v1`.
- **Naming deviation from the spec:** the expenses revert is `deletePurchase`, not the spec's `deleteTransaction`. `lib/expenses.ts` already exports transaction helpers, and a bare `deleteTransaction` would read as a general-purpose API rather than the reverse of one fact handler.
- **Commit messages carry no AI attribution.** No `Co-Authored-By: Claude`, no `Claude-Session:` trailers.

---

### Task 1: Toast gains an optional action

Undo is impossible today: `showToast(message, icon?)` renders text only. This adds an optional action button without changing any of the ~40 existing call sites.

**Files:**
- Modify: `components/ui/Toast.tsx:33-50` (state + `showToast`), and the render body
- Test: `components/ui/Toast.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `showToast(message: string, icon?: string, action?: { label: string; onPress: () => void }): void` and `useToastStore` state gaining `action: ToastAction | null`

- [ ] **Step 1: Write the failing test**

Create `components/ui/Toast.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, showToast } from './Toast';

describe('showToast', () => {
  beforeEach(() => useToastStore.getState().hide());

  it('keeps the existing two-argument call working', () => {
    showToast('Saved', 'done');
    const s = useToastStore.getState();
    expect(s.message).toBe('Saved');
    expect(s.icon).toBe('done');
    expect(s.action).toBeNull();
  });

  it('stores an action when one is given', () => {
    let ran = false;
    showToast('Logged ₹80 to Expenses', '', { label: 'Undo', onPress: () => { ran = true; } });
    const s = useToastStore.getState();
    expect(s.action?.label).toBe('Undo');
    s.action?.onPress();
    expect(ran).toBe(true);
  });

  it('clears the action on hide, so it cannot leak into the next toast', () => {
    showToast('One', '', { label: 'Undo', onPress: () => {} });
    useToastStore.getState().hide();
    showToast('Two');
    expect(useToastStore.getState().action).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/Toast.test.ts --project logic`
Expected: FAIL — `s.action` is undefined (the property does not exist yet).

- [ ] **Step 3: Write minimal implementation**

In `components/ui/Toast.tsx`, replace the `ToastState` interface, store, and `showToast` (currently lines 33-50):

```tsx
export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  message: string | null;
  icon: string | null;
  action: ToastAction | null;
  show: (message: string, icon?: string, action?: ToastAction) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  icon: null,
  action: null,
  show: (message, icon = '', action) => set({ message, icon, action: action ?? null }),
  hide: () => set({ message: null, icon: null, action: null }),
}));

export function showToast(message: string, icon?: string, action?: ToastAction) {
  useToastStore.getState().show(message, icon, action);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/Toast.test.ts --project logic`
Expected: PASS (3 tests)

- [ ] **Step 5: Render the action button**

In the `ToastProvider` render body in the same file, read `action` from the store alongside `message`, and render a pressable to the right of the text when it is non-null. Match the file's existing theme usage — `colors.accent` for the label, and call `hide()` after `onPress` so the toast dismisses on tap:

```tsx
{action ? (
  <Pressable
    onPress={() => { action.onPress(); hide(); }}
    hitSlop={12}
    style={{ paddingHorizontal: 12, paddingVertical: 4 }}
  >
    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>
      {action.label}
    </Text>
  </Pressable>
) : null}
```

- [ ] **Step 6: Verify nothing else broke**

Run: `npm run typecheck && npm test`
Expected: tsc clean; full suite passes. The third argument is optional, so all existing `showToast` call sites still compile.

- [ ] **Step 7: Commit**

```bash
git add components/ui/Toast.tsx components/ui/Toast.test.ts
git commit -m "feat(toast): optional action button

showToast rendered text only, so there was no way to offer an Undo. Adds an
optional third argument; the ~40 existing two-argument call sites are
unchanged. The action is cleared on hide so it cannot leak into the next toast."
```

---

### Task 2: Fact types and the persisted queue

**Files:**
- Create: `lib/minilink/types.ts`
- Create: `lib/minilink/queue.ts`
- Test: `lib/minilink/queue.test.ts`

**Interfaces:**
- Consumes: `uuidv4` from `store/outbox`, `persistGet`/`persistSet` from `store/persist`
- Produces:
  - `type FactKind = 'purchase' | 'timeSpent' | 'bodyStat' | 'commitment'`
  - `interface Fact<K extends FactKind = FactKind>` with `id`, `kind`, `source`, `sourceItemId`, `at`, `payload`, `attempts`, `status`, `lastError?`
  - `type FactStatus = 'pending' | 'failed'`
  - `emit<K extends FactKind>(kind: K, source: TargetMiniAppId, sourceItemId: string, payload: FactPayload[K]): Fact<K> | null`
  - `listPending(): Fact[]`, `listFailed(): Fact[]`, `removeFact(id: string): void`, `markFailure(id: string, error: string): void`, `resetQueue(): void`

- [ ] **Step 1: Write `lib/minilink/types.ts`**

```ts
import type { TargetMiniAppId } from '../targetCategories';

/**
 * A fact is something that happened in one mini-app, stated so another can
 * understand it. It is not an instruction — the consuming app decides what to
 * do about it, or whether to do anything at all.
 *
 * Four kinds, not twenty-two app pairs: `purchase` has three eventual emitters
 * and one consumer, so a new connection is usually a new emitter rather than a
 * new kind.
 */
export type FactKind = 'purchase' | 'timeSpent' | 'bodyStat' | 'commitment';

export interface FactPayload {
  /**
   * No currency field: the consuming app owns currency. ExpensesDoc.currency
   * is the source of truth, so an emitter cannot mislabel rupees as dollars.
   */
  purchase: { label: string; amount: number; category?: string };
  timeSpent: { label: string; minutes: number; taskId?: string };
  bodyStat: { weightKg?: number; heightCm?: number; bmi?: number };
  commitment: { label: string; due?: string; note?: string };
}

export type FactStatus = 'pending' | 'failed';

export interface Fact<K extends FactKind = FactKind> {
  id: string;
  kind: K;
  source: TargetMiniAppId;
  /** The row in the source app, so a human can trace where this came from. */
  sourceItemId: string;
  at: number;
  payload: FactPayload[K];
  attempts: number;
  status: FactStatus;
  lastError?: string;
}

/** Attempts before a fact is parked as `failed` and surfaced to the audit. */
export const MAX_FACT_ATTEMPTS = 5;
```

- [ ] **Step 2: Write the failing test**

Create `lib/minilink/queue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { emit, listPending, listFailed, markFailure, removeFact, resetQueue } from './queue';
import { MAX_FACT_ATTEMPTS } from './types';

describe('minilink queue', () => {
  beforeEach(() => resetQueue());

  it('enqueues a fact as pending with an id', () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 });
    expect(f).not.toBeNull();
    expect(f!.status).toBe('pending');
    expect(f!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(listPending()).toHaveLength(1);
  });

  it('never throws on a bad payload — emitting must not break the emitting app', () => {
    // amount is required; a malformed call returns null instead of raising.
    expect(() => emit('purchase', 'shopping-list', 'x', { label: 'milk' } as never)).not.toThrow();
    expect(listPending()).toHaveLength(0);
  });

  it('parks a fact as failed after MAX_FACT_ATTEMPTS', () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 })!;
    for (let i = 0; i < MAX_FACT_ATTEMPTS; i++) markFailure(f.id, 'boom');
    expect(listPending()).toHaveLength(0);
    expect(listFailed()).toHaveLength(1);
    expect(listFailed()[0].lastError).toBe('boom');
  });

  it('keeps a fact pending while attempts remain', () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 })!;
    markFailure(f.id, 'transient');
    expect(listPending()).toHaveLength(1);
    expect(listPending()[0].attempts).toBe(1);
  });

  it('removes a delivered fact', () => {
    const f = emit('purchase', 'shopping-list', 'item-1', { label: 'milk', amount: 80 })!;
    removeFact(f.id);
    expect(listPending()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/minilink/queue.test.ts --project logic`
Expected: FAIL — cannot resolve `./queue`.

- [ ] **Step 4: Write `lib/minilink/queue.ts`**

```ts
import { persistGet, persistSet } from '../../store/persist';
import { uuidv4 } from '../../store/outbox';
import type { TargetMiniAppId } from '../targetCategories';
import { MAX_FACT_ATTEMPTS, type Fact, type FactKind, type FactPayload } from './types';

const KEY = 'minilink_facts_v1';

function read(): Fact[] {
  return persistGet<Fact[]>(KEY, []);
}

function write(facts: Fact[]): void {
  persistSet(KEY, facts);
}

/** Reject a payload that cannot produce a sane row downstream. */
function isValid<K extends FactKind>(kind: K, payload: FactPayload[K]): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (kind === 'purchase') {
    const p = payload as FactPayload['purchase'];
    return typeof p.label === 'string' && p.label.length > 0 && Number.isFinite(p.amount);
  }
  if (kind === 'timeSpent') {
    const p = payload as FactPayload['timeSpent'];
    return Number.isFinite(p.minutes);
  }
  return true;
}

/**
 * Record that something happened. Fire-and-forget by contract: this must never
 * throw into the emitting app's UI and never block its save, so every failure
 * path returns null instead of raising.
 */
export function emit<K extends FactKind>(
  kind: K,
  source: TargetMiniAppId,
  sourceItemId: string,
  payload: FactPayload[K],
): Fact<K> | null {
  try {
    if (!isValid(kind, payload)) return null;
    const fact: Fact<K> = {
      id: uuidv4(),
      kind,
      source,
      sourceItemId,
      at: Date.now(),
      payload,
      attempts: 0,
      status: 'pending',
    };
    write([...read(), fact as Fact]);
    return fact;
  } catch {
    return null;
  }
}

export function listPending(): Fact[] {
  return read().filter((f) => f.status === 'pending');
}

export function listFailed(): Fact[] {
  return read().filter((f) => f.status === 'failed');
}

export function removeFact(id: string): void {
  write(read().filter((f) => f.id !== id));
}

export function markFailure(id: string, error: string): void {
  write(
    read().map((f) => {
      if (f.id !== id) return f;
      const attempts = f.attempts + 1;
      return {
        ...f,
        attempts,
        lastError: error,
        status: attempts >= MAX_FACT_ATTEMPTS ? 'failed' : 'pending',
      };
    }),
  );
}

/** Test seam only. */
export function resetQueue(): void {
  write([]);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/minilink/queue.test.ts --project logic`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/minilink/types.ts lib/minilink/queue.ts lib/minilink/queue.test.ts
git commit -m "feat(minilink): fact types and a persisted queue

A fact is something that happened in one mini-app, stated so another can
understand it. Four kinds rather than twenty-two app pairs, so a new
connection is usually a new emitter, not a new kind.

emit() is fire-and-forget by contract: an invalid payload or a storage error
returns null rather than throwing into the emitting app's UI. Facts park as
failed after 5 attempts instead of being dropped silently."
```

---

### Task 3: The ledger — idempotency and provenance

**Files:**
- Create: `lib/minilink/ledger.ts`
- Test: `lib/minilink/ledger.test.ts`

**Interfaces:**
- Consumes: `persistGet`/`persistSet` from `store/persist`; `TargetMiniAppId`
- Produces:
  - `interface LedgerEntry { factId; sourceApp; sourceItemId; targetApp; createdItemId; at; reversedAt?: number }`
  - `hasApplied(factId: string): boolean`
  - `recordApplied(e: Omit<LedgerEntry, 'at'>): void`
  - `findByCreatedItem(createdItemId: string): LedgerEntry | undefined`
  - `findByFact(factId: string): LedgerEntry | undefined`
  - `markReversed(factId: string): void`
  - `resetLedger(): void`

- [ ] **Step 1: Write the failing test**

Create `lib/minilink/ledger.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasApplied, recordApplied, findByCreatedItem, findByFact, markReversed, resetLedger,
} from './ledger';

const entry = {
  factId: 'fact-1',
  sourceApp: 'shopping-list' as const,
  sourceItemId: 'item-1',
  targetApp: 'expenses' as const,
  createdItemId: 'tx-1',
};

describe('minilink ledger', () => {
  beforeEach(() => resetLedger());

  it('reports a fact as applied only after it is recorded', () => {
    expect(hasApplied('fact-1')).toBe(false);
    recordApplied(entry);
    expect(hasApplied('fact-1')).toBe(true);
  });

  it('finds provenance by the created item, for the "from" line', () => {
    recordApplied(entry);
    expect(findByCreatedItem('tx-1')?.sourceApp).toBe('shopping-list');
    expect(findByCreatedItem('nope')).toBeUndefined();
  });

  it('keeps a reversed entry so a retry cannot resurrect an undone fact', () => {
    recordApplied(entry);
    markReversed('fact-1');
    expect(findByFact('fact-1')?.reversedAt).toBeGreaterThan(0);
    // Still "applied" — this is what blocks re-apply on the next drain.
    expect(hasApplied('fact-1')).toBe(true);
  });

  it('does not double-record the same fact', () => {
    recordApplied(entry);
    recordApplied({ ...entry, createdItemId: 'tx-2' });
    expect(findByFact('fact-1')?.createdItemId).toBe('tx-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/minilink/ledger.test.ts --project logic`
Expected: FAIL — cannot resolve `./ledger`.

- [ ] **Step 3: Write `lib/minilink/ledger.ts`**

```ts
import { persistGet, persistSet } from '../../store/persist';
import type { TargetMiniAppId } from '../targetCategories';

/**
 * What each delivered fact created, and where.
 *
 * This is why no mini-app type gains an `origin` field: provenance lives here,
 * so Transaction, ShoppingItem and the rest are untouched and all 22 screens
 * compile as they are.
 *
 * `factId` is unique here, which is what makes delivery idempotent — the same
 * lesson as ad_events: the dedup key belongs in the store, not in every
 * handler remembering to check.
 */
export interface LedgerEntry {
  factId: string;
  sourceApp: TargetMiniAppId;
  sourceItemId: string;
  targetApp: TargetMiniAppId;
  createdItemId: string;
  at: number;
  /** Set when the user undid it. The row is kept, never deleted. */
  reversedAt?: number;
}

const KEY = 'minilink_ledger_v1';

function read(): LedgerEntry[] {
  return persistGet<LedgerEntry[]>(KEY, []);
}

function write(entries: LedgerEntry[]): void {
  persistSet(KEY, entries);
}

export function hasApplied(factId: string): boolean {
  return read().some((e) => e.factId === factId);
}

export function recordApplied(e: Omit<LedgerEntry, 'at'>): void {
  if (hasApplied(e.factId)) return;
  write([...read(), { ...e, at: Date.now() }]);
}

export function findByCreatedItem(createdItemId: string): LedgerEntry | undefined {
  return read().find((e) => e.createdItemId === createdItemId && !e.reversedAt);
}

export function findByFact(factId: string): LedgerEntry | undefined {
  return read().find((e) => e.factId === factId);
}

export function markReversed(factId: string): void {
  write(read().map((e) => (e.factId === factId ? { ...e, reversedAt: Date.now() } : e)));
}

/** Test seam only. */
export function resetLedger(): void {
  write([]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/minilink/ledger.test.ts --project logic`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/minilink/ledger.ts lib/minilink/ledger.test.ts
git commit -m "feat(minilink): ledger for idempotency and provenance

Records what each delivered fact created and where, keyed by fact id. That
key is what makes delivery idempotent — the dedup rule lives in the store
rather than in every handler, the same lesson as ad_events.

Keeping provenance here rather than adding an origin field to Transaction and
nine other item types is what leaves all 22 mini-app screens untouched. A
reversed entry is kept, never deleted, so a retry cannot resurrect a fact the
user undid."
```

---

### Task 4: The expenses handler

**Files:**
- Modify: `lib/expenses.ts` (append two exports; nothing existing changes)
- Test: `lib/minilink/handlers.expenses.test.ts`

**Interfaces:**
- Consumes: `Fact` from `lib/minilink/types`; existing `loadExpensesDoc`, `saveExpensesDoc`, `Transaction`, `ExpensesDoc` from `lib/expenses`
- Produces:
  - `logPurchase(f: Fact<'purchase'>): Promise<string>` — returns the created transaction id
  - `deletePurchase(createdItemId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/minilink/handlers.expenses.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/minilink/handlers.expenses.test.ts --project logic`
Expected: FAIL — `logPurchase` is not exported from `../expenses`.

- [ ] **Step 3: Append the handler to `lib/expenses.ts`**

Add at the end of the file, importing `Fact` and `uuidv4` at the top:

```ts
import type { Fact } from './minilink/types';
import { uuidv4 } from '../store/outbox';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/minilink/handlers.expenses.test.ts --project logic`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/expenses.ts lib/minilink/handlers.expenses.test.ts
git commit -m "feat(expenses): accept purchase facts from other mini-apps

Two new exports beside the existing load/save; no existing function or type
changes. Currency is absent from the fact payload on purpose — ExpensesDoc
owns it, so an emitting app cannot mislabel rupees as dollars.

deletePurchase is the reverse for undo and is a no-op on an unknown id: undo
must never throw."
```

---

### Task 5: The link table and the drain loop

**Files:**
- Create: `lib/minilink/links.ts`
- Create: `lib/minilink/drain.ts`
- Test: `lib/minilink/drain.test.ts`

**Interfaces:**
- Consumes: `listPending`, `markFailure`, `removeFact` from `./queue`; `hasApplied`, `recordApplied` from `./ledger`; `logPurchase`, `deletePurchase` from `../expenses`
- Produces:
  - `interface Link { kind: FactKind; from: TargetMiniAppId; to: TargetMiniAppId; apply: (f: Fact) => Promise<string>; revert: (createdItemId: string) => Promise<void> }`
  - `LINKS: Link[]`
  - `findLink(kind: FactKind, from: TargetMiniAppId): Link | undefined`
  - `drainMiniLink(): Promise<void>`
  - `undoFact(factId: string): Promise<boolean>`

- [ ] **Step 1: Write `lib/minilink/links.ts`**

```ts
import { logPurchase, deletePurchase } from '../expenses';
import type { Fact, FactKind } from './types';
import type { TargetMiniAppId } from '../targetCategories';

export interface Link {
  kind: FactKind;
  from: TargetMiniAppId;
  to: TargetMiniAppId;
  /** Applies the fact and returns the id of the row it created. */
  apply: (f: Fact) => Promise<string>;
  revert: (createdItemId: string) => Promise<void>;
}

/**
 * The entire integration graph, in one place, as data.
 *
 * Phase 1 wires exactly one link. The admission test for a new row is: would a
 * user be surprised the connection did NOT happen? Nobody has ever been
 * surprised that a dice roll did not reach their habit tracker.
 */
export const LINKS: Link[] = [
  {
    kind: 'purchase',
    from: 'shopping-list',
    to: 'expenses',
    apply: (f) => logPurchase(f as Fact<'purchase'>),
    revert: deletePurchase,
  },
];

export function findLink(kind: FactKind, from: TargetMiniAppId): Link | undefined {
  return LINKS.find((l) => l.kind === kind && l.from === from);
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/minilink/drain.test.ts`:

```ts
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
 */
const failing = vi.hoisted(() => ({ on: false }));
vi.mock('./links', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./links')>();
  return {
    ...actual,
    findLink: (kind: string, from: string) =>
      failing.on
        ? { kind, from, to: 'expenses', apply: () => Promise.reject(new Error('boom')), revert: () => Promise.resolve() }
        : actual.findLink(kind as never, from as never),
  };
});

import { emit, listPending, listFailed, resetQueue } from './queue';
import { resetLedger, hasApplied, findByCreatedItem } from './ledger';
import { drainMiniLink, undoFact } from './drain';
import { loadTransactions } from '../expenses';
import { MAX_FACT_ATTEMPTS } from './types';

describe('minilink drain', () => {
  beforeEach(() => { storage.clear(); resetQueue(); resetLedger(); failing.on = false; });

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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/minilink/drain.test.ts --project logic`
Expected: FAIL — cannot resolve `./drain`.

- [ ] **Step 4: Write `lib/minilink/drain.ts`**

```ts
import { listPending, markFailure, removeFact } from './queue';
import { hasApplied, recordApplied, findByFact, markReversed } from './ledger';
import { findLink, LINKS } from './links';

/**
 * Deliver every pending fact.
 *
 * Delivery happens on drain, not on view, so a fact emitted at 09:00 lands
 * whether or not the consuming app is ever opened.
 */
export async function drainMiniLink(): Promise<void> {
  for (const fact of listPending()) {
    // The ledger, not the handler, is what makes this safe to retry.
    if (hasApplied(fact.id)) {
      removeFact(fact.id);
      continue;
    }

    const link = findLink(fact.kind, fact.source);
    if (!link) {
      // No consumer for this kind from this app. Emitting one is legitimate —
      // a fact nobody listens to is dropped, not retried forever.
      removeFact(fact.id);
      continue;
    }

    try {
      const createdItemId = await link.apply(fact);
      recordApplied({
        factId: fact.id,
        sourceApp: fact.source,
        sourceItemId: fact.sourceItemId,
        targetApp: link.to,
        createdItemId,
      });
      removeFact(fact.id);
    } catch (e) {
      markFailure(fact.id, e instanceof Error ? e.message : String(e));
    }
  }
}

/**
 * Reverse a delivered fact. Returns false when there is nothing to undo.
 *
 * The ledger row is marked reversed rather than deleted, so a retry arriving
 * afterwards cannot resurrect what the user undid.
 */
export async function undoFact(factId: string): Promise<boolean> {
  const entry = findByFact(factId);
  if (!entry || entry.reversedAt) return false;

  const link = LINKS.find((l) => l.to === entry.targetApp && l.from === entry.sourceApp);
  if (!link) return false;

  await link.revert(entry.createdItemId);
  markReversed(factId);
  return true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/minilink/drain.test.ts --project logic`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/minilink/links.ts lib/minilink/drain.ts lib/minilink/drain.test.ts
git commit -m "feat(minilink): link table and drain loop

The integration graph is data in one file, so adding a connection is a table
row plus a handler rather than a change to the delivery machinery.

Delivery happens on drain, not on view, so a fact emitted at 09:00 lands
whether or not the consuming app is ever opened. A fact with no matching link
is dropped rather than retried forever — emitting something nobody listens to
is legitimate. Undo marks the ledger row reversed instead of deleting it, so a
retry cannot resurrect what the user undid."
```

---

### Task 6: Wire it up — emit on check-off, drain on launch, Undo toast

This is the only task that touches existing screens. It is deliberately last.

**Files:**
- Modify: `app/mini-apps/shopping-list.tsx:120-122` (the `toggle` function)
- Modify: `app/_layout.tsx` (start the drain beside `startOutbox()`)
- Test: `lib/minilink/emitOnCheck.test.ts`

**Interfaces:**
- Consumes: `emit` from `lib/minilink/queue`; `drainMiniLink`, `undoFact` from `lib/minilink/drain`; `showToast` from `components/ui/Toast`
- Produces: `shouldEmitPurchase(item: ShoppingItem, nextChecked: boolean): boolean` exported from `lib/minilink/rules.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/minilink/emitOnCheck.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldEmitPurchase } from './rules';
import type { ShoppingItem } from '../shoppingList';

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'i1', listId: 'l1', name: 'milk', quantity: '1',
  price: 80, category: 'Dairy', checked: false,
  createdAt: new Date().toISOString(), ...over,
});

describe('shouldEmitPurchase', () => {
  it('emits when an unchecked priced item is checked off', () => {
    expect(shouldEmitPurchase(item(), true)).toBe(true);
  });

  it('does not emit when unchecking — that is not a purchase', () => {
    expect(shouldEmitPurchase(item({ checked: true }), false)).toBe(false);
  });

  it('does not emit for a zero-price item — nothing was spent', () => {
    expect(shouldEmitPurchase(item({ price: 0 }), true)).toBe(false);
  });

  it('does not emit for a missing price', () => {
    expect(shouldEmitPurchase(item({ price: undefined as never }), true)).toBe(false);
  });

  it('does not emit for a negative price', () => {
    expect(shouldEmitPurchase(item({ price: -5 }), true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/minilink/emitOnCheck.test.ts --project logic`
Expected: FAIL — cannot resolve `./rules`.

- [ ] **Step 3: Write `lib/minilink/rules.ts`**

```ts
import type { ShoppingItem } from '../shoppingList';

/**
 * Whether checking this item off should be reported as a purchase.
 *
 * Kept out of the screen so the condition is testable without mounting a
 * component, and so the "why didn't it log?" question has one answer to read.
 */
export function shouldEmitPurchase(item: ShoppingItem, nextChecked: boolean): boolean {
  if (!nextChecked) return false;            // unchecking is not a purchase
  if (typeof item.price !== 'number') return false;
  if (!Number.isFinite(item.price) || item.price <= 0) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/minilink/emitOnCheck.test.ts --project logic`
Expected: PASS (5 tests)

- [ ] **Step 5: Emit from the shopping-list screen**

In `app/mini-apps/shopping-list.tsx`, add imports:

```tsx
import { emit } from '../../lib/minilink/queue';
import { drainMiniLink, undoFact } from '../../lib/minilink/drain';
import { shouldEmitPurchase } from '../../lib/minilink/rules';
import { showToast } from '../../components/ui/Toast';
```

Replace the existing `toggle` (line 120):

```tsx
const toggle = (item: ShoppingItem) => {
  const nextChecked = !item.checked;
  updateItems(items.map(row => row.id === item.id ? { ...row, checked: nextChecked } : row));

  if (!shouldEmitPurchase(item, nextChecked)) return;

  // Fire-and-forget: emit() never throws, and the drain is not awaited, so a
  // slow or failing delivery cannot make the checkbox feel laggy.
  const fact = emit('purchase', 'shopping-list', item.id, {
    label: item.name,
    amount: item.price,
    category: item.category,
  });
  if (!fact) return;

  void drainMiniLink().then(() => {
    showToast(ttx('Logged to Expenses'), '', {
      label: ttx('Undo'),
      onPress: () => { void undoFact(fact.id); },
    });
  });
};
```

- [ ] **Step 6: Start the drain at launch**

In `app/_layout.tsx`, import beside the existing outbox import:

```tsx
import { drainMiniLink } from '../lib/minilink/drain';
```

and call it where `startOutbox()` is invoked, so facts emitted in a previous session are delivered even if the user never returns to shopping-list:

```tsx
void drainMiniLink();
```

- [ ] **Step 7: Verify the whole suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tsc clean; 0 lint errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/mini-apps/shopping-list.tsx app/_layout.tsx lib/minilink/rules.ts lib/minilink/emitOnCheck.test.ts
git commit -m "feat(shopping-list): checking off a priced item logs it to Expenses

Checking off milk at 80 now logs an expense and offers Undo. Unchecking does
not, and neither does an item with no price — nothing was spent.

The condition lives in lib/minilink/rules.ts rather than the screen so it is
testable without mounting a component and 'why didn't it log?' has one answer
to read. Emission is fire-and-forget and the drain is not awaited, so delivery
cannot make the checkbox feel laggy. The root layout drains at launch too, so
a fact emitted in a previous session lands even if shopping-list is never
reopened."
```

---

### Task 7: Structural guard and failed-fact visibility

The recurring failure mode in this codebase is work that reports healthy while dead. A fact queue quietly accumulating failures would be exactly that.

**Files:**
- Create: `lib/minilink/links.test.ts`
- Modify: `scripts/audit-backend.mjs` (add check `[6/6]`, renumber `[N/5]` → `[N/6]`)

**Interfaces:**
- Consumes: `LINKS` from `./links`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the structural test**

Create `lib/minilink/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LINKS } from './links';

/**
 * The role table in the design is only real if something enforces it.
 * Note the asymmetry: a declared role need not be wired (a Tracker with no
 * incoming link is valid), but a wired link must match the roles.
 */
const TRACKERS = ['tasks', 'expenses', 'notes', 'fitness', 'habits', 'planner', 'shopping-list', 'learn'];
const EMITTERS = ['bill-splitter', 'pomodoro', 'bmi', 'marketplace'];
const UTILITIES = ['calculator', 'converter', 'dice', 'color-tools', 'json-formatter', 'world-clock', 'markdown', 'studio', 'editor'];

describe('minilink link table', () => {
  it('never routes to or from a Utility app', () => {
    const bad = LINKS.filter(l => UTILITIES.includes(l.from) || UTILITIES.includes(l.to));
    expect(bad.map(l => `${l.from}->${l.to}`), 'Utilities hold no state worth propagating').toEqual([]);
  });

  it('only ever targets a Tracker', () => {
    const bad = LINKS.filter(l => !TRACKERS.includes(l.to));
    expect(bad.map(l => l.to), 'only Trackers can receive facts').toEqual([]);
  });

  it('only ever sources from a Tracker or an Emitter', () => {
    const bad = LINKS.filter(l => !TRACKERS.includes(l.from) && !EMITTERS.includes(l.from));
    expect(bad.map(l => l.from)).toEqual([]);
  });

  it('has no duplicate (kind, from) pair — findLink would silently pick the first', () => {
    const seen = LINKS.map(l => `${l.kind}:${l.from}`);
    expect(seen.length).toBe(new Set(seen).size);
  });

  it('gives every link both an apply and a revert, so nothing is unundoable', () => {
    for (const l of LINKS) {
      expect(typeof l.apply, `${l.from}->${l.to} apply`).toBe('function');
      expect(typeof l.revert, `${l.from}->${l.to} revert`).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run lib/minilink/links.test.ts --project logic`
Expected: PASS (5 tests)

- [ ] **Step 3: Verify the guard can fail**

Temporarily add `{ kind: 'purchase', from: 'dice', to: 'expenses', apply: async () => 'x', revert: async () => {} }` to `LINKS`, re-run, and confirm the first two tests fail naming `dice`. Then remove it. A guard tested only in the passing direction proves nothing.

- [ ] **Step 4: Add the audit check**

In `scripts/audit-backend.mjs`, renumber the existing headings `[1/5]`…`[5/5]` to `[1/6]`…`[5/6]`, then insert before the final `console.log(failures …)`:

```js
console.log('\n[6/6] Mini-app fact queue');
{
  // A queue that silently accumulates failures is the exact shape of the bugs
  // this script exists to catch: green everywhere, dead in fact. The count
  // lives on-device, so what is asserted here is that the plumbing that
  // surfaces it is still wired.
  const src = readAll(['lib/minilink'], ['.ts']);

  if (!/export function markFailure/.test(src)) fail('minilink queue has no markFailure — failures cannot be recorded');
  else if (!/status:\s*attempts >= MAX_FACT_ATTEMPTS/.test(src)) fail('minilink queue no longer parks exhausted facts as failed');
  else ok('failed facts are parked, not dropped');

  if (!/export function listFailed/.test(src)) fail('minilink queue has no listFailed — failures cannot be surfaced');
  else ok('failed facts are queryable');

  if (!/hasApplied\(fact\.id\)/.test(src)) fail('drain no longer checks the ledger — delivery is not idempotent');
  else ok('drain is ledger-guarded');
}
```

- [ ] **Step 5: Run the audit**

Run: `node scripts/audit-backend.mjs`
Expected: all six sections pass, `All checks passed`, exit 0.

- [ ] **Step 6: Verify the audit check can fail**

Temporarily rename `listFailed` to `listFailed2` in `lib/minilink/queue.ts`, run `node scripts/audit-backend.mjs; echo $?`, and confirm it reports the failure and exits 1. Then revert.

- [ ] **Step 7: Full verification and commit**

Run: `npm run typecheck && npm run lint && npm test && node scripts/audit-backend.mjs`

```bash
git add lib/minilink/links.test.ts scripts/audit-backend.mjs
git commit -m "test(minilink): enforce the role table and surface failed facts

The Trackers/Emitters/Utilities split is only real if something enforces it,
so the link table is now asserted: never route to or from a Utility, only ever
target a Tracker, no duplicate (kind, from) pair, and every link has both an
apply and a revert. Verified the guard fails as intended by adding a dice link.

audit-backend check [6/6] asserts the queue still parks exhausted facts as
failed, still exposes them, and that drain is still ledger-guarded. A queue
that silently accumulates failures is the exact shape of bug this script
exists to catch."
```

---

## Done when

- Checking off a priced shopping-list item creates an expense and shows an Undo toast.
- Tapping Undo removes the expense, and a later drain does not recreate it.
- Killing the app between emit and drain still delivers the fact on next launch.
- Unchecking an item, or checking a zero-price item, does nothing.
- `npm run typecheck`, `npm run lint`, `npm test` and `node scripts/audit-backend.mjs` are all clean.
- No existing mini-app type was modified.

## Not in this plan

Phases 2 (the five remaining links) and 3 (the `↳ from <app>` provenance lines in consuming screens) are separate plans. Do not start them here: Phase 1 is the decision point, and it is cheap to abandon.
