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
