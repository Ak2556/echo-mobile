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
