import { describe, expect, it } from 'vitest';
import { isServiceCaller, serviceKeys } from './serviceCaller';

const envOf = (e: Record<string, string>) => (k: string) => e[k];

describe('serviceKeys', () => {
  it('collects the legacy key and every new secret key', () => {
    expect(serviceKeys(envOf({
      SUPABASE_SERVICE_ROLE_KEY: 'jwt',
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_a' }),
    }))).toEqual(['jwt', 'sb_secret_a']);
    expect(serviceKeys(envOf({ SUPABASE_SECRET_KEYS: JSON.stringify(['x', 'y']) }))).toEqual(['x', 'y']);
    expect(serviceKeys(envOf({ SUPABASE_SECRET_KEYS: 'sb_secret_plain' }))).toEqual(['sb_secret_plain']);
    expect(serviceKeys(envOf({}))).toEqual([]);
  });
});

describe('isServiceCaller', () => {
  it('accepts only an exact key', async () => {
    expect(await isServiceCaller('jwt', ['jwt', 'other'])).toBe(true);
    expect(await isServiceCaller('other', ['jwt', 'other'])).toBe(true);
    expect(await isServiceCaller('jwt-but-longer', ['jwt'])).toBe(false);
    expect(await isServiceCaller('a-user-jwt', ['jwt'])).toBe(false);
  });

  it('never treats an empty token as the service, even with no keys configured', async () => {
    expect(await isServiceCaller('', [''])).toBe(false);
    expect(await isServiceCaller('anything', [])).toBe(false);
  });
});
