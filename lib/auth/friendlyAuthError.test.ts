import { describe, it, expect } from 'vitest';
import { friendlyAuthError } from './friendlyAuthError';

describe('friendlyAuthError', () => {
  it('explains the rate limit as a wait, not a mistake', () => {
    // Verbatim from Supabase. The user reads "email rate limit exceeded",
    // assumes they mistyped, and retries immediately — the one action that
    // cannot work.
    expect(friendlyAuthError('email rate limit exceeded'))
      .toBe('Too many codes requested. Wait a few minutes and try again.');
  });

  it('says a used code is used, rather than implying it was wrong', () => {
    // OTPs are single-use, so a retry after a verify that already succeeded
    // lands here. The old text blamed the code.
    const msg = friendlyAuthError('Token has expired or is invalid');
    expect(msg).toBe('That code has already been used or has expired. Request a new one.');
  });

  it('handles the offline case', () => {
    expect(friendlyAuthError('Network request failed')).toMatch(/connection/i);
    expect(friendlyAuthError('Authentication timed out. Check your connection and try again.'))
      .toMatch(/connection/i);
  });

  it('passes an unrecognised error through unchanged', () => {
    // A specific unknown beats a vague known one when someone is debugging.
    expect(friendlyAuthError('Database error saving new user'))
      .toBe('Database error saving new user');
  });

  it('keeps null as null so callers can treat it as success', () => {
    expect(friendlyAuthError(null)).toBeNull();
    expect(friendlyAuthError(undefined)).toBeNull();
    expect(friendlyAuthError('')).toBeNull();
  });
});
