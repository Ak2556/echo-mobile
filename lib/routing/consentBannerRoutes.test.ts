/**
 * M12 + L9 (2026-09-30 release audit): the analytics banner covered "Log in"
 * and the legal links on the sign-in screen, and its buttons rendered clipped
 * ("No thank", "Accep") in the release build.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { consentBannerAllowedOn } from './consentBannerRoutes';

describe('consentBannerAllowedOn', () => {
  it('stays off the sign-in and onboarding flow', () => {
    for (const p of ['/', '/welcome', '/auth/login', '/auth/email', '/auth/phone', '/auth/signup-wizard', '/onboarding']) {
      expect(consentBannerAllowedOn(p), p).toBe(false);
    }
  });

  it('shows inside the app', () => {
    for (const p of ['/home', '/explore', '/you', '/settings', '/messages']) {
      expect(consentBannerAllowedOn(p), p).toBe(true);
    }
  });
});

describe('ConsentBanner', () => {
  const src = readFileSync(resolve(__dirname, '../../components/ConsentBanner.tsx'), 'utf8');

  it('checks the route before rendering', () => {
    expect(src).toMatch(/if \(!visible \|\| !consentBannerAllowedOn\(pathname\)\) return null;/);
  });

  it('keeps button layout off the Pressables (release-build layout drop)', () => {
    // Every Pressable in the banner renders its layout through an inner View.
    const pressables = src.match(/<Pressable[\s\S]*?<\/Pressable>/g) ?? [];
    expect(pressables.length).toBe(2);
    for (const p of pressables) {
      expect(p).not.toMatch(/style=\{\(\{ pressed \}\) => \[\s*styles\.btn/);
      expect(p).toMatch(/<View\s+style=\{\[\s*styles\.btn/);
    }
  });
});
