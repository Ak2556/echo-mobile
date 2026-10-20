import { describe, expect, it } from 'vitest';
import { randomBase36, randomInt } from './randomId';

describe('randomId', () => {
  it('randomInt stays inside [0, max)', () => {
    for (let i = 0; i < 500; i++) {
      const n = randomInt(7);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('randomBase36 gives the length asked for, from the base-36 alphabet', () => {
    for (let i = 0; i < 50; i++) expect(randomBase36(4)).toMatch(/^[0-9a-z]{4}$/);
    expect(randomBase36(0)).toBe('');
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomBase36(8)));
    expect(seen.size).toBeGreaterThan(190);
  });
});
