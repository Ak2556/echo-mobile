# Mini-app interconnection — design

**Date:** 2026-09-03
**Status:** approved design, not yet implemented
**Scope:** a fact bus connecting six pairs of mini-apps; no changes to any existing app's public API

## Purpose

Make the mini-apps behave as one product in the handful of places a user would
be surprised they don't — checking off a shopping item should reach Expenses,
finishing a pomodoro should reach the task it was spent on — without rewriting
the twelve `lib/*.ts` modules or turning twenty-two independent screens into a
single coupled system.

The goal is *felt* interconnection at specific moments, not a complete graph. A
connection that never fires is not a feature.

## Context: what exists today

- **22 mini-app screens** under `app/mini-apps/`, each with a `lib/<app>.ts`
  module following one convention: a `mini:<app>` storage key, typed item
  interfaces, and `load*` / `save*` functions over AsyncStorage. No Supabase.
- **Cross-app reads already ship.** `lib/localSearch.ts` exposes
  `searchLocalProductivity()` (spanning fitness, habits, learn, voice-memo,
  notes, planner, shopping, tasks, expenses, world-clock) and
  `getTodayProductivity()`. Both are already rendered by
  `app/(tabs)/apps.tsx:247,255` and `app/target-progress.tsx`. The read half of
  interconnection is built.
- **Cross-app writes do not exist.** Exactly one app reads another's module:
  `bmi` imports `lib/fitness`. Everything else is a silo.
- **`lib/miniAppIntegration.ts`** looks like an integration layer but is not
  one: `relatedMiniApps()` has no callers, and the file supplies aliases and
  snapshot text only.
- **A durable queue pattern already exists.** `store/outbox.ts` +
  `lib/outboxProcessor.ts` provide `pending | failed` ops with `drainOutbox()`
  started from `app/_layout.tsx`. The bus reuses this shape rather than
  inventing a second one.
- **Mini-app data is device-local** and stays last-write-wins per the standing
  sync decision.

## The species split

Twenty-two apps are not twenty-two participants. Roles are fixed and closed:

| Role | Apps | Emits | Receives |
|---|---|---|---|
| **Trackers** | tasks, expenses, notes, fitness, habits, planner, shopping-list, learn | yes | yes |
| **Emitters** | bill-splitter, pomodoro, bmi, marketplace | yes | no |
| **Utilities** | calculator, converter, dice, color-tools, json-formatter, world-clock, markdown, studio, editor | no | no |

Utilities compute an answer and forget it. They are not "not yet integrated" —
they hold no state worth propagating. Recording that here is the point: it
stops a future contributor from feeling obliged to wire `json-formatter` into
`habits`.

The table describes **capability**, not wiring. A Tracker may legitimately
receive nothing yet — `habits`, `notes` and `learn` are Trackers with no
incoming link in this design, and that is fine.

**`voice-memo` is deliberately not an Emitter here.** An earlier draft listed
it, on the strength of "a spoken thought becomes a note". Turning a recording
into a note is a transcription decision — which engine, what happens on a bad
transcript, whether the audio is kept — and none of that fits in a fact
payload. It is a separate design, not a seventh row in this table.

## Facts

A fact is something that happened, stated so another app can understand it. It
is not an instruction; the consumer decides what to do.

```ts
// lib/minilink/types.ts
export type FactKind = 'purchase' | 'timeSpent' | 'bodyStat' | 'commitment';

export interface Fact<K extends FactKind = FactKind> {
  id: string;              // uuidv4() from store/outbox
  kind: K;
  source: TargetMiniAppId;
  sourceItemId: string;    // the originating row, so undo can trace back
  at: number;
  payload: FactPayload[K];
}

interface FactPayload {
  purchase:   { label: string; amount: number; currency: CurrencyCode; category?: string };
  timeSpent:  { label: string; minutes: number; taskId?: string };
  bodyStat:   { weightKg?: number; heightCm?: number; bmi?: number };
  commitment: { label: string; due?: string; note?: string };
}
```

Four kinds, not twenty-two pairs. `purchase` has three emitters and one
consumer, so the seventh link is a new *emitter*, not a new *kind*.

## The link table

```ts
// lib/minilink/links.ts — the entire integration graph
interface Link {
  kind: FactKind;
  from: TargetMiniAppId;
  to: TargetMiniAppId;
  apply:  (f: Fact) => Promise<string>;  // returns the created item id
  revert: (createdItemId: string) => Promise<void>;
}

export const LINKS: Link[] = [
  { kind: 'purchase',   from: 'shopping-list', to: 'expenses', apply: logPurchase,     revert: deleteTransaction },
  { kind: 'purchase',   from: 'bill-splitter', to: 'expenses', apply: logPurchase,     revert: deleteTransaction },
  { kind: 'purchase',   from: 'marketplace',   to: 'expenses', apply: logPurchase,     revert: deleteTransaction },
  { kind: 'timeSpent',  from: 'pomodoro',      to: 'tasks',    apply: addTimeToTask,   revert: removeTimeEntry },
  { kind: 'bodyStat',   from: 'bmi',           to: 'fitness',  apply: recordBodyStat,  revert: deleteBodyStat },
  { kind: 'commitment', from: 'planner',       to: 'tasks',    apply: addCommitment,   revert: deleteTask },
];
```

Every one of the six is a case where a user would be surprised the connection
*didn't* happen. That is the admission test for adding a seventh.

## App contract

A consuming app exports one function per fact kind it accepts, beside its
existing `load*`/`save*`:

```ts
// lib/expenses.ts
export async function logPurchase(f: Fact<'purchase'>): Promise<string> {
  const txs = await loadTransactions();
  const tx: Transaction = {
    id: uuidv4(),
    type: 'expense',
    amount: f.payload.amount,
    category: f.payload.category ?? 'Other',
    note: f.payload.label,
    date: todayISO(),
  };
  await saveTransactions([tx, ...txs]);
  return tx.id;
}
```

An emitting app calls `emit()` at its existing save point. Fire-and-forget: it
never blocks the emitter's save and never throws into its UI.

```ts
emit('purchase', 'shopping-list', item.id,
     { label: item.name, amount: item.price, currency: userCurrency });
```

**No existing app type changes.** All 22 screens compile untouched.

## Provenance and undo

Provenance lives in the bus, not in ten item types:

```ts
// lib/minilink/ledger.ts
{ factId, sourceApp, sourceItemId, targetApp, createdItemId, at, reversedAt? }
```

- The `↳ from Shopping List` line is a ledger lookup by created item id.
- Undo calls `revert(createdItemId)` and stamps `reversedAt`. The row is kept,
  never deleted, so a later retry cannot resurrect an undone fact.

`factId` is unique in the ledger, so idempotency is enforced by the store
rather than by every handler remembering to check — the same lesson as
`ad_events`.

## Delivery and failure

Facts enter a persisted queue modelled on `store/outbox.ts`. `drainMiniLink()`
runs from `app/_layout.tsx` beside `startOutbox()`. Delivery happens on drain,
not on view, so a fact emitted at 09:00 lands whether or not the consuming app
is ever opened.

| Case | Behaviour |
|---|---|
| Handler throws | Fact stays `pending`, retried next drain |
| 5 failed attempts | Marked `failed` and surfaced by the audit script — never silently dropped |
| Same fact drained twice | Ledger `factId` uniqueness blocks the second apply |
| Source item deleted before drain | Fact still applies; it happened |
| Undone, then a retry arrives | `reversedAt` blocks re-apply |

A non-zero `failed` count must be visible. The recurring failure mode in this
codebase is work that reports healthy while dead; a queue quietly accumulating
failures would be exactly that, so `scripts/audit-backend.mjs` gains a check.

## Where the user feels it

Three moments, two of which already exist:

1. **At the action** — a toast with an Undo action.
2. **At the destination** — the `↳ from <app>` provenance line.
3. **At the glance** — the Tools dashboard. `getTodayProductivity()` already
   renders a cross-app picture; the bus makes that picture *true* rather than
   ten numbers that never inform each other. This is the moment that sells the
   feature, and it needs no new surface.

## Prerequisites

1. **`showToast(message, icon?)` has no action button** (`components/ui/Toast.tsx:47`).
   It must gain an optional action before Undo is possible. Small and reusable.
2. **Currency.** `lib/expenses.ts` defaults to `USD` while the market is India.
   Every emitter must pass the user's real currency or rupees will be logged as
   dollars.

## Testing

- **Structural** — every `LINK` references real app ids; `from` is always a
  Tracker or Emitter; `to` is always a Tracker; no Utility appears in the
  table. This makes the role table enforceable instead of aspirational, in the
  same style as the guard that caught six uncatalogued mini-apps. Note the
  asymmetry the test must allow: a declared role need not be wired (a Tracker
  with no incoming link is valid), but a wired link must match the roles.
- **Idempotency** — applying the same fact twice produces one row.
- **Round-trip** — apply then revert leaves state identical to before.
- **Per-handler** — six unit tests over `load*`/`save*` with the AsyncStorage stub.

## Phasing

| Phase | Contents | Rationale |
|---|---|---|
| 1 | Bus core, ledger, Toast action, **one link** (shopping-list → expenses) | Proves the whole path on the highest-frequency case. Everything is new files; the only existing code touched is `showToast` and one call site. |
| 2 | The remaining five links | Mechanical once Phase 1 lands |
| 3 | Provenance lines in consuming screens | The only phase touching existing UI — last, so freeze exposure is at the end and cancellable |

## Explicitly out of scope

- Cross-device propagation of facts. Device-local only.
- Any connection involving a Utility app.
- Rewriting mini-app storage into a unified model.
- Automatic links the user did not trigger by an explicit action in a source app.

## Standing constraint

The project is in feature freeze pending store submission. This is a new
subsystem and represents a deliberate override of that freeze, made with the
freeze stated. Phase 1 is the decision point: it is cheap to abandon.
