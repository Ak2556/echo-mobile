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
