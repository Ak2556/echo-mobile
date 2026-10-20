import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORT_MD } from '../constants/legal/support';
import { SUPPORT_EMAIL, DPO_EMAIL, GRIEVANCE_OFFICER_EMAIL } from '../constants/legal/entity';
import { isPublicRoute } from '../lib/routing/publicRoutes';

/**
 * downloadecho.com/support is the Support URL on the store listings and the place to ask for an
 * account to be deleted without the app. It was a 404 until 2026-10-20.
 */
describe('the Support page', () => {
  it('is a route a signed-out visitor can read', () => {
    expect(existsSync('app/support.tsx')).toBe(true);
    expect(isPublicRoute('/support')).toBe(true);
  });

  it('names the same contacts as the legal documents, with no unresolved placeholder', () => {
    for (const email of [SUPPORT_EMAIL, DPO_EMAIL, GRIEVANCE_OFFICER_EMAIL]) expect(SUPPORT_MD).toContain(email);
    expect(SUPPORT_MD).not.toContain('[[');
  });

  it('links only to pages that exist', () => {
    const links = [...SUPPORT_MD.matchAll(/\]\((\/[^)]*)\)/g)].map(m => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const file = link === '/' ? 'app/index.tsx' : `app${link}.tsx`;
      expect(existsSync(file), `${link} -> ${file}`).toBe(true);
    }
  });

  it('tells a person how to delete their account', () => {
    expect(SUPPORT_MD).toMatch(/Settings → Delete Account/);
  });
});
