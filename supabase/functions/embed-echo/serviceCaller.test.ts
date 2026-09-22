import { describe, expect, it, vi } from 'vitest';
import { isServiceCaller, jwtRole, serviceKeys } from './serviceCaller';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;

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
  const noNetwork = vi.fn(() => { throw new Error('should not call'); }) as unknown as typeof fetch;

  it('accepts an exact key without asking the auth server', async () => {
    expect(await isServiceCaller('jwt', ['jwt', 'other'], 'https://x', noNetwork)).toBe(true);
    expect(await isServiceCaller('other', ['jwt', 'other'], 'https://x', noNetwork)).toBe(true);
  });

  it('never treats an empty or non-service token as the service', async () => {
    expect(await isServiceCaller('', [''], 'https://x', noNetwork)).toBe(false);
    expect(await isServiceCaller('jwt-but-longer', ['jwt'], 'https://x', noNetwork)).toBe(false);
    expect(await isServiceCaller(jwt({ role: 'authenticated' }), [], 'https://x', noNetwork)).toBe(false);
  });

  it('asks the auth admin API about a service-role token that matches no env key', async () => {
    const token = jwt({ role: 'service_role' });
    const allow = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    expect(await isServiceCaller(token, ['different'], 'https://x', allow)).toBe(true);
    expect(allow.mock.calls[0][0]).toBe('https://x/auth/v1/admin/users?page=1&per_page=1');

    // A forged claim: the auth server refuses it.
    const deny = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await isServiceCaller(token, ['different'], 'https://x', deny)).toBe(false);
  });
});

describe('jwtRole', () => {
  it('reads the role claim and tolerates junk', () => {
    expect(jwtRole(jwt({ role: 'service_role' }))).toBe('service_role');
    expect(jwtRole('sb_secret_abc')).toBeNull();
    expect(jwtRole('a.b.c')).toBeNull();
  });
});
