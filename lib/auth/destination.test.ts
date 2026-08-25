import { describe, expect, it } from 'vitest';
import { destinationFor } from './destination';

/**
 * The case that matters most is the first one: someone standing on
 * /auth/callback whose session is already established. Routing used to be
 * edge-triggered on a status change, so if the code exchange finished before
 * that screen mounted — which is the normal ordering for Google, where the
 * browser result is consumed in providers/google.ts — no change ever arrived
 * and the spinner ran forever.
 */
describe('destinationFor', () => {
  it('rescues a signed-in user stranded on the OAuth callback screen', () => {
    expect(destinationFor('/auth/callback', 'ready')).toBe('/(tabs)/home');
  });

  it('sends a signed-in user home from any auth screen or the index', () => {
    expect(destinationFor('/auth/login', 'ready')).toBe('/(tabs)/home');
    expect(destinationFor('/auth/phone', 'ready')).toBe('/(tabs)/home');
    expect(destinationFor('/', 'ready')).toBe('/(tabs)/home');
  });

  it('leaves a signed-in user alone once they are in the app', () => {
    expect(destinationFor('/(tabs)/home', 'ready')).toBeNull();
    expect(destinationFor('/messages/abc', 'ready')).toBeNull();
    expect(destinationFor('/terms', 'ready')).toBeNull();
  });

  it('moves nobody while the session is still resolving', () => {
    for (const path of ['/', '/auth/callback', '/messages/abc']) {
      expect(destinationFor(path, 'checking')).toBeNull();
    }
  });

  it('leaves a signed-out user on the public legal routes', () => {
    // Regression: this function shipped with its own signed-out rule
    // (pathname.startsWith('/auth/')) while AuthGuard used isPublicRoute. Two
    // authorities, different rules, and the stricter one won — so a signed-out
    // visitor deep-linking to /terms was bounced to login within a frame, which
    // is exactly the bug the legal-routes fix had already closed.
    expect(destinationFor('/terms', 'signed-out')).toBeNull();
    expect(destinationFor('/privacy', 'signed-out')).toBeNull();
    expect(destinationFor('/legal/eu-rep', 'signed-out')).toBeNull();
    expect(destinationFor('/welcome', 'signed-out')).toBeNull();
  });

  it('sends a signed-out user to login from anywhere but the auth screens', () => {
    expect(destinationFor('/messages/abc', 'signed-out')).toBe('/auth/login');
    expect(destinationFor('/create-post', 'signed-out')).toBe('/auth/login');
    // '/' is public here on purpose: app/index.tsx renders its own Redirect for
    // a signed-out user, and racing it from two places is how loops start.
    // Already somewhere in auth: leave them there rather than bouncing them
    // out of the phone or email step they are mid-way through.
    expect(destinationFor('/auth/phone', 'signed-out')).toBeNull();
    expect(destinationFor('/auth/login', 'signed-out')).toBeNull();
  });

  it('routes an unfinished account to the wizard, but never interrupts it', () => {
    expect(destinationFor('/auth/callback', 'needs-onboarding')).toBe('/auth/signup-wizard');
    expect(destinationFor('/(tabs)/home', 'needs-onboarding')).toBe('/auth/signup-wizard');
    expect(destinationFor('/auth/signup-wizard', 'needs-onboarding')).toBeNull();
  });

  it('is idempotent — asking twice from the destination says stay', () => {
    const first = destinationFor('/auth/callback', 'ready');
    expect(first).toBe('/(tabs)/home');
    expect(destinationFor(String(first), 'ready')).toBeNull();
  });
});
