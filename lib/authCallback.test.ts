import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthCallbackUrl,
  hasAuthCallbackPayload,
  parseAuthCallbackUrl,
} from './authCallback';

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      setSession: mocks.setSession,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  },
}));

describe('auth callback helpers', () => {
  beforeEach(() => {
    mocks.setSession.mockReset();
    mocks.exchangeCodeForSession.mockReset();
  });

  it('parses implicit-token callbacks from the hash fragment', () => {
    const parsed = parseAuthCallbackUrl(
      'echo://auth/callback#access_token=access.jwt&refresh_token=refresh.jwt&type=signup'
    );

    expect(parsed).toMatchObject({
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
      code: null,
      type: 'signup',
    });
  });

  it('detects PKCE code callbacks from the query string', () => {
    const url = 'echo://auth/callback?code=abc123&type=recovery';

    expect(hasAuthCallbackPayload(url)).toBe(true);
    expect(parseAuthCallbackUrl(url)).toMatchObject({
      code: 'abc123',
      type: 'recovery',
    });
  });

  it('sets a session when access and refresh tokens are present', async () => {
    mocks.setSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });

    const result = await consumeAuthCallbackUrl(
      'echo://auth/callback#access_token=access.jwt&refresh_token=refresh.jwt&type=signup'
    );

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: 'access.jwt',
      refresh_token: 'refresh.jwt',
    });
    expect(result.status).toBe('success');
  });

  it('exchanges a PKCE code when present', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { user: { id: 'u2' } } },
      error: null,
    });

    const result = await consumeAuthCallbackUrl('echo://auth/callback?code=abc123');

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(result.status).toBe('success');
  });

  it('surfaces provider errors without touching Supabase session state', async () => {
    const result = await consumeAuthCallbackUrl(
      'echo://auth/callback?error=access_denied&error_description=User%20cancelled'
    );

    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'error',
      type: null,
      error: 'access_denied: User cancelled',
    });
  });
});
