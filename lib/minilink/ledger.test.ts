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
