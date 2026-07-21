import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CURRENCIES } from './currency';

describe('marketplace backend contract', () => {
  it('allows every app currency in marketplace_listings', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260719103000_marketplace_all_currencies.sql'),
      'utf8',
    );

    for (const currency of CURRENCIES) {
      expect(sql).toContain(`'${currency.code}'`);
    }
  });
});
