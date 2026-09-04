import { listPending, markFailure, removeFact } from './queue';
import { hasApplied, recordApplied, findByFact, markReversed } from './ledger';
import { findLink, LINKS } from './links';
import type { Fact } from './types';

/**
 * Serialization tail. Every drain is chained onto the previous one so no two
 * runs of the loop below can ever overlap.
 *
 * This has to be a CHAIN, not an `if (inFlight) return;` early exit. The
 * shopping-list screen does `drainMiniLink().then(...)` and then reads the
 * ledger to decide whether to tell the user their money was logged — so the
 * promise this returns must not settle until THIS caller's fact has been
 * processed. An early exit would resolve immediately for the second tapper,
 * the ledger would be read before the fact landed, and a purchase that is
 * about to be logged correctly would be reported as "Couldn't log to
 * Expenses yet".
 *
 * `.then(runDrain, runDrain)` runs the next drain on both fulfilment and
 * rejection, so a rejection inside one run cannot poison the chain for every
 * later caller. runDrain itself never rejects (every fact body is guarded),
 * but the tail must be robust to it regardless.
 */
let tail: Promise<void> = Promise.resolve();

/**
 * Deliver every pending fact.
 *
 * Delivery happens on drain, not on view, so a fact emitted at 09:00 lands
 * whether or not the consuming app is ever opened.
 *
 * Drains are serialized. Without that, checking off two priced items in quick
 * succession double-logs the first one: `link.apply` awaits a network round
 * trip inside `loadExpensesDoc`, and `removeFact` only runs after it — so a
 * second drain starting during that await still sees the first fact pending
 * and its ledger row not yet written, and applies it a second time. The
 * second `recordApplied` is a no-op, so the duplicate transaction has no
 * ledger row at all and Undo can never reach it. The same overlap also makes
 * `logPurchase`/`deletePurchase` — read-modify-writes of a single doc — lose
 * transactions outright.
 */
export function drainMiniLink(): Promise<void> {
  tail = tail.then(runDrain, runDrain);
  return tail;
}

/**
 * One pass over the queue.
 *
 * Each fact's body is isolated in its own try/catch, including the early
 * exits: removeFact and markFailure write to storage and can throw, and a
 * single storage error must not abort the whole loop and stop delivery for
 * every other pending fact. Reading the pending list itself is guarded too —
 * if storage cannot be read there is nothing to drain, and this promise must
 * still resolve rather than reject into an unhandled rejection at the caller.
 */
async function runDrain(): Promise<void> {
  let pending: Fact[];
  try {
    pending = listPending();
  } catch {
    return;
  }

  for (const fact of pending) {
    try {
      // The ledger, not the handler, is what makes this safe to retry.
      if (hasApplied(fact.id)) { removeFact(fact.id); continue; }

      const link = findLink(fact.kind, fact.source);
      if (!link) {
        // No consumer for this kind from this app. Emitting one is legitimate —
        // a fact nobody listens to is dropped, not retried forever.
        removeFact(fact.id);
        continue;
      }

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
      // A failure to RECORD a failure must not kill the loop either. If storage
      // is down the fact simply stays pending and is retried next drain.
      try {
        markFailure(fact.id, e instanceof Error ? e.message : String(e));
      } catch { /* storage unavailable; leave the fact pending */ }
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
