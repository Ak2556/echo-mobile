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
