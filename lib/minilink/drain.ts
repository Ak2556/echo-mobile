import { listPending, markFailure, removeFact } from './queue';
import { hasApplied, recordApplied, findByFact, markReversed } from './ledger';
import { findLink, LINKS } from './links';
import type { Fact } from './types';

/**
 * Deliver every pending fact.
 *
 * Delivery happens on drain, not on view, so a fact emitted at 09:00 lands
 * whether or not the consuming app is ever opened.
 *
 * Each fact's body is isolated in its own try/catch, including the early
 * exits: removeFact and markFailure write to storage and can throw, and a
 * single storage error must not abort the whole loop and stop delivery for
 * every other pending fact. Reading the pending list itself is guarded too —
 * if storage cannot be read there is nothing to drain, and this promise must
 * still resolve rather than reject into an unhandled rejection at the caller.
 */
export async function drainMiniLink(): Promise<void> {
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
