import { describe, it, expect } from 'vitest';
import { shouldEmitPurchase, describePostDrain, describeUndo, purchaseAmount } from './rules';
import type { ShoppingItem } from '../mini-apps/shoppingList';

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

describe('describeUndo', () => {
  it('stays silent when the row really was removed', () => {
    expect(describeUndo('reversed')).toBeNull();
  });

  it('says so when there was nothing to reverse', () => {
    const message = describeUndo('nothing-to-undo');
    expect(message).toBeTruthy();
    expect(message?.toLowerCase()).toContain('nothing to undo');
  });

  it('says so when the removal failed, without claiming it succeeded', () => {
    const message = describeUndo('failed');
    expect(message).toBeTruthy();
    expect(message?.toLowerCase()).toContain("couldn't remove");
    expect(message?.toLowerCase()).not.toContain('removed from');
  });
});

describe('purchaseAmount', () => {
  it('logs price × quantity, matching the list total', () => {
    expect(purchaseAmount(item({ price: 45.5, quantity: '2' }))).toBe(91);
    expect(purchaseAmount(item({ price: 0.1, quantity: '3' }))).toBe(0.3);
  });

  it('treats a blank or invalid quantity as one', () => {
    expect(purchaseAmount(item({ price: 80, quantity: '' }))).toBe(80);
    expect(purchaseAmount(item({ price: 80, quantity: 'a few' }))).toBe(80);
    expect(purchaseAmount(item({ price: 80, quantity: '0' }))).toBe(80);
  });
});
