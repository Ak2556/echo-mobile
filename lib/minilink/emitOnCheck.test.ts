import { describe, it, expect } from 'vitest';
import { shouldEmitPurchase, describePostDrain } from './rules';
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

describe('describePostDrain', () => {
  it('offers Undo when the fact actually landed', () => {
    const result = describePostDrain(true);
    expect(result.showUndo).toBe(true);
    expect(result.message.toLowerCase()).toContain('logged');
  });

  it('does not offer Undo and does not claim success when the fact did not land', () => {
    const result = describePostDrain(false);
    expect(result.showUndo).toBe(false);
    expect(result.message.toLowerCase()).not.toContain('logged to expenses');
  });
});
