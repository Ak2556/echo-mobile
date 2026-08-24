import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './publicRoutes';

/**
 * AuthGuard sends a signed-out user to /auth/login from anything that is not
 * on this list. The legal documents have to be on it: the login screen links
 * to Terms and Privacy in its footer, App Store review taps those links before
 * creating an account, and the DSA notice routes are meant to be readable by
 * anyone. They were not, so the footer links bounced back to login and the
 * Maestro cold-launch flow failed asserting "Terms of Service" after
 * openLink: echo:///terms.
 */
describe('isPublicRoute', () => {
  it('lets a signed-out visitor read the legal documents', () => {
    expect(isPublicRoute('/terms')).toBe(true);
    expect(isPublicRoute('/privacy')).toBe(true);
    expect(isPublicRoute('/legal/eu-rep')).toBe(true);
  });

  it('keeps the pre-auth screens reachable', () => {
    expect(isPublicRoute('/')).toBe(true);
    expect(isPublicRoute('/welcome')).toBe(true);
    expect(isPublicRoute('/onboarding')).toBe(true);
    expect(isPublicRoute('/auth/login')).toBe(true);
    expect(isPublicRoute('/auth/signup-wizard')).toBe(true);
  });

  it('still guards everything that needs an account', () => {
    for (const path of [
      '/messages/abc',
      '/create-post',
      '/edit-profile',
      '/bookmarks',
      '/delete-account',
      '/mod-appeals',
      '/settings',
    ]) {
      expect(isPublicRoute(path), `${path} must require a session`).toBe(false);
    }
  });

  it('does not let a lookalike route slip through on a prefix match', () => {
    // /terms-of-battle or /privacy-settings must not inherit public access.
    expect(isPublicRoute('/terms-and-conditions-of-something')).toBe(false);
    expect(isPublicRoute('/privacy-settings')).toBe(false);
    expect(isPublicRoute('/authorised-dealers')).toBe(false);
  });
});
