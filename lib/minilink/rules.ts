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

/** What the post-drain toast should say, given whether this fact actually landed. */
export interface PostDrainToast {
  message: string;
  /** True only when there is something to undo. */
  showUndo: boolean;
}

/**
 * The drain resolving is not proof that THIS fact was delivered — it swallows
 * per-fact failures so one bad fact cannot block every other one. So the
 * toast must be decided from the ledger, not from the drain's return value:
 * a false "logged" claim on a feature that logs someone's money is the worst
 * available outcome, worse than no toast at all.
 */
export function describePostDrain(applied: boolean): PostDrainToast {
  return applied
    ? { message: 'Logged to Expenses', showUndo: true }
    : { message: "Couldn't log to Expenses yet", showUndo: false };
}

/** How an Undo tap ended. */
export type UndoOutcome = 'reversed' | 'nothing-to-undo' | 'failed';

/**
 * What the post-undo toast should say. `null` means say nothing — the row is
 * gone from Expenses and the disappearing toast is confirmation enough.
 *
 * The two other cases must never be silent. `undoFact` returns false when
 * there is nothing to reverse, and the delete path writes to storage and can
 * reject; swallowing either leaves the user believing an expense was removed
 * while it is still on their books. Same reasoning as describePostDrain: on a
 * feature that touches someone's money, an honest "it didn't happen" beats a
 * confident silence.
 */
export function describeUndo(outcome: UndoOutcome): string | null {
  if (outcome === 'reversed') return null;
  if (outcome === 'nothing-to-undo') return "Nothing to undo — it wasn't logged";
  return "Couldn't remove it from Expenses";
}
