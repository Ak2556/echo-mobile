import { describe, expect, it } from 'vitest';
import {
  SIGNUP_GRACE_HOURS,
  SIGNUP_LAST,
  SIGNUP_LOOKBACK_DAYS,
  interpretSignups,
  signupWindow,
} from './policy';

// From 2026-09-30 to 2026-11-19 no new account could finish signing up (a
// missing column grant), and nothing noticed for seven weeks: the only trace
// was a toast on the phones it failed for. This check watches the outcome.

describe('signupWindow', () => {
  it('skips the last few hours, so someone mid-signup is not counted, and ignores old history', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const w = signupWindow(now);
    expect(Date.parse(w.before)).toBe(now - SIGNUP_GRACE_HOURS * 3600_000);
    expect(Date.parse(w.since)).toBe(now - SIGNUP_LOOKBACK_DAYS * 86_400_000);
    expect(w.last).toBe(SIGNUP_LAST);
  });
});

describe('interpretSignups', () => {
  it('fails when the last verified sign-ups all went unfinished', () => {
    // Production on 2026-10-06: the three since 09-30 had all failed.
    const r = interpretSignups({ started: 3, finished: 0 }, null);
    expect(r).toMatchObject({ check: 'signups', ok: false });
    expect(r.detail).toBe('0 of the last 3 verified sign-ups finished; the final profile save may be failing');
  });

  it('passes as soon as one of them finished', () => {
    expect(interpretSignups({ started: 3, finished: 1 }, null)).toMatchObject({ ok: true, detail: '1 of the last 3 verified sign-ups finished' });
  });

  it('does not judge on fewer sign-ups than it needs, including none at all', () => {
    expect(interpretSignups({ started: SIGNUP_LAST - 1, finished: 0 }, null).ok).toBe(true);
    expect(interpretSignups({ started: 0, finished: 0 }, null)).toMatchObject({ ok: true, detail: 'too few verified sign-ups to judge (0)' });
  });

  it('treats a failed query as a failure: unknown is not healthy', () => {
    expect(interpretSignups(null, 'permission denied for function signup_funnel')).toMatchObject({
      ok: false,
      detail: 'query failed: permission denied for function signup_funnel',
    });
    expect(interpretSignups(null, null).ok).toBe(false);
  });

  it('reads counts that arrive as strings (Postgres bigint over PostgREST)', () => {
    expect(interpretSignups({ started: '3', finished: '0' } as never, null).ok).toBe(false);
  });
});
