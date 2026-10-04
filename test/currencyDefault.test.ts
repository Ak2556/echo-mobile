/**
 * M7 + M8 (2026-09-30 release audit): the Shopping List mini-app was titled
 * after another company's app ("AnyList Pro"), and money in Bill Splitter,
 * Shopping List and the Khata default was hardcoded to USD in an
 * India-first app.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultCurrency, formatPrice } from '../lib/mini-apps/currency';

describe('defaultCurrency', () => {
  it.each([
    ['en-IN', 'INR'], ['hi-IN', 'INR'], ['en-US', 'USD'], ['en-GB', 'GBP'],
    ['de-DE', 'EUR'], ['fr-FR', 'EUR'], ['ar-AE', 'AED'], ['ja-JP', 'JPY'],
    ['zh-Hant-TW', 'TWD'], ['en_IN', 'INR'],
  ])('%s → %s', (locale, code) => {
    expect(defaultCurrency(locale)).toBe(code);
  });

  it('falls back to INR when the locale has no region or an unmapped one', () => {
    expect(defaultCurrency('en')).toBe('INR');
    expect(defaultCurrency('xx-ZZ')).toBe('INR');
  });

  it('formats rupees with Indian grouping', () => {
    expect(formatPrice(125000, 'INR')).toBe('₹1,25,000');
  });
});

describe('the audited screens', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('no hardcoded "$" money in Bill Splitter or Shopping List', () => {
    for (const f of ['app/mini-apps/bill-splitter.tsx', 'app/mini-apps/shopping-list.tsx']) {
      expect(read(f), f).not.toMatch(/\$\$\{|>\$\{|>\$</);
    }
    expect(read('app/mini-apps/bill-splitter.tsx')).toMatch(/const CUR = getCurrencySymbol\(defaultCurrency\(\)\)/);
  });

  it('Shopping List shows the currency Expenses logs in', () => {
    // Checked-off items are logged to Expenses, so the list follows its
    // currency: it showed "$" while Khata recorded the same item in ₹.
    const src = read('app/mini-apps/shopping-list.tsx');
    expect(src).toMatch(/const DEFAULT_CUR = getCurrencySymbol\(defaultCurrency\(\)\)/);
    expect(src).toMatch(/loadExpensesDoc\(\)\.then\(doc => setCur\(getCurrencySymbol\(doc\.currency\)\)\)/);
  });

  it('the Khata default is the device currency, not USD', () => {
    expect(read('lib/mini-apps/expenses.ts')).toMatch(/DEFAULT_EXPENSE_CURRENCY: CurrencyCode = defaultCurrency\(\)/);
  });

  it('no mini-app borrows another product\'s name', () => {
    expect(read('app/mini-apps/shopping-list.tsx')).not.toMatch(/AnyList/);
  });
});
