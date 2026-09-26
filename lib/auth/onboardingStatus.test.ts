import { describe, expect, it } from 'vitest';
import { statusForProfile } from './onboardingStatus';
import type { AuthProfile } from './types';

const profile = (over: Partial<AuthProfile> = {}): AuthProfile => ({
  id: 'u1',
  username: 'user_akash_40213',
  display_name: 'Akash',
  bio: null,
  avatar_color: null,
  avatar_url: null,
  ...over,
});

describe('statusForProfile', () => {
  it('sends an unfinished profile to onboarding', () => {
    expect(statusForProfile(profile({ onboarded_at: null }))).toBe('needs-onboarding');
  });

  it('treats a missing onboarded_at the same as null', () => {
    // A row read before the column existed, or a select that omitted it.
    expect(statusForProfile(profile())).toBe('needs-onboarding');
  });

  it('lets a finished profile through', () => {
    expect(statusForProfile(profile({ onboarded_at: '2026-09-26T04:00:00Z' }))).toBe('ready');
  });

  it('does NOT infer onboarding from username, which is always set', () => {
    // The whole bug: handle_new_user() fills username on every signup, from a
    // fallback chain that terminates in a value derived from new.id. The old
    // rule was Boolean(profile.username), so it never once returned
    // 'needs-onboarding' and first-time OAuth users skipped the wizard.
    expect(statusForProfile(profile({ username: 'user_x_1', onboarded_at: null })))
      .toBe('needs-onboarding');
    expect(statusForProfile(profile({ username: null, onboarded_at: '2026-01-01T00:00:00Z' })))
      .toBe('ready');
  });

  it('does not route a failed profile fetch into the wizard', () => {
    // null means the request failed or RLS hid the row — never that the user is
    // new, because the signup trigger always creates one. Sending them to the
    // wizard would let step 3 overwrite the display name and username of an
    // established account over a dropped request.
    expect(statusForProfile(null)).toBe('ready');
  });
});
