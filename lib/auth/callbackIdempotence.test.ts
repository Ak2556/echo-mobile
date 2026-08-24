import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A PKCE authorization code is single-use, and Echo hands the same callback
 * URL to as many as three consumers: the browser result in
 * providers/google.ts, the Linking event in listener.ts, and the
 * app/auth/callback.tsx screen. Exactly one of them wins the exchange.
 *
 * The losers used to report "Google sign-in did not finish. Try again." to a
 * user who was, at that moment, signed in — because the winner had already
 * established the session.
 *
 * Losing the race is not a failure. What matters is whether there is a session
 * at the end, not which consumer produced it.
 */
const exchangeCodeForSession = vi.fn();
const getSession = vi.fn();
const setSession = vi.fn();

vi.mock('../supabase', () => ({
  supabase: { auth: { exchangeCodeForSession, getSession, setSession } },
}));

const { consumeAuthCallbackUrl } = await import('./callback');

const URL_WITH_CODE = 'echo://auth/callback?code=abc123';
const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'u1' } };

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  getSession.mockReset();
  setSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
});

describe('consumeAuthCallbackUrl', () => {
  it('reports success when it wins the exchange', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null });

    await expect(consumeAuthCallbackUrl(URL_WITH_CODE)).resolves.toMatchObject({ status: 'success' });
  });

  it('reports success when another consumer already used the code', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid request: both auth code and code verifier should be non-empty' },
    });
    getSession.mockResolvedValue({ data: { session: SESSION } });

    const result = await consumeAuthCallbackUrl(URL_WITH_CODE);

    expect(result.status).toBe('success');
    expect(result).toMatchObject({ session: SESSION });
  });

  it('still reports an error when the exchange fails and nobody is signed in', async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'code challenge does not match' },
    });
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(consumeAuthCallbackUrl(URL_WITH_CODE)).resolves.toMatchObject({
      status: 'error',
      error: 'code challenge does not match',
    });
  });

  it('passes a provider error straight through without touching the session', async () => {
    const denied = 'echo://auth/callback?error=access_denied&error_description=User%20cancelled';

    await expect(consumeAuthCallbackUrl(denied)).resolves.toMatchObject({ status: 'error' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });
});
