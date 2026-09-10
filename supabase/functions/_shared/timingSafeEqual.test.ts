import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from './timingSafeEqual';

/**
 * Timing is not testable here, but correctness is — and a constant-time
 * compare that quietly returns true for everything is far worse than the
 * short-circuiting one it replaced. These are the cases that would catch that.
 */
describe('timingSafeEqual', () => {
  it('accepts an exact match', async () => {
    expect(await timingSafeEqual('s3cret-value', 's3cret-value')).toBe(true);
  });

  it.each([
    ['a differing last byte', 's3cret-value', 's3cret-valuf'],
    ['a differing first byte', 's3cret-value', 't3cret-value'],
    ['a prefix of the secret', 's3cret-value', 's3cret'],
    ['the secret plus a suffix', 's3cret-value', 's3cret-value!'],
    ['empty against a secret', '', 's3cret-value'],
    ['a secret against empty', 's3cret-value', ''],
    ['case differing only', 's3cret-value', 'S3CRET-VALUE'],
  ])('rejects %s', async (_label, a, b) => {
    expect(await timingSafeEqual(a, b)).toBe(false);
  });

  it('treats two empty strings as equal, matching === semantics', async () => {
    expect(await timingSafeEqual('', '')).toBe(true);
  });

  it('handles non-ascii without throwing', async () => {
    expect(await timingSafeEqual('sécret—ü', 'sécret—ü')).toBe(true);
    expect(await timingSafeEqual('sécret—ü', 'secret-u')).toBe(false);
  });

  it('does not confuse a long input with a short one', async () => {
    expect(await timingSafeEqual('a'.repeat(1000), 'a'.repeat(999))).toBe(false);
    expect(await timingSafeEqual('a'.repeat(1000), 'a'.repeat(1000))).toBe(true);
  });
});
