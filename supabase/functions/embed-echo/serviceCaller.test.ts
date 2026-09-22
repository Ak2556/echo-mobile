import { describe, expect, it } from 'vitest';
import { isServiceCaller } from './serviceCaller';

describe('isServiceCaller', () => {
  it('accepts only the exact shared secret', async () => {
    expect(await isServiceCaller('s3cret', 's3cret')).toBe(true);
    expect(await isServiceCaller('s3cret-but-longer', 's3cret')).toBe(false);
    expect(await isServiceCaller('a-user-jwt', 's3cret')).toBe(false);
  });

  it('fails closed when the header or the secret is missing', async () => {
    expect(await isServiceCaller(null, 's3cret')).toBe(false);
    expect(await isServiceCaller('', 's3cret')).toBe(false);
    // Unset EMBED_ECHO_SECRET must not turn a missing header into a match.
    expect(await isServiceCaller('', '')).toBe(false);
    expect(await isServiceCaller('anything', '')).toBe(false);
  });
});
