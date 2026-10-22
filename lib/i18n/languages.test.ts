import { describe, expect, it } from 'vitest';
import { APP_LANGUAGES, LAUNCH_LANGUAGES, LAUNCH_LANGUAGE_CODES, normalizeAppLanguage } from './languages';

/**
 * Only English and Hindi are offered at launch: the other 24 translations are corrupt.
 * Everything that picks an interface language goes through LAUNCH_LANGUAGES.
 */
describe('launch languages', () => {
  it('are English and Hindi', () => {
    expect([...LAUNCH_LANGUAGE_CODES]).toEqual(['en', 'hi']);
    expect(LAUNCH_LANGUAGES.map(l => l.code)).toEqual(['en', 'hi']);
  });

  it('are a subset of what the code carries', () => {
    expect(APP_LANGUAGES.length).toBe(26);
    for (const code of LAUNCH_LANGUAGE_CODES) expect(APP_LANGUAGES.some(l => l.code === code)).toBe(true);
  });

  it('a stored choice outside the launch list falls back to English', () => {
    expect(normalizeAppLanguage('hi')).toBe('hi');
    expect(normalizeAppLanguage('es')).toBe('en');
    expect(normalizeAppLanguage('ar')).toBe('en');
    expect(normalizeAppLanguage(undefined)).toBe('en');
  });

  it('the pickers use the launch list, not the whole catalogue', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/settings.tsx', 'utf8')).toMatch(/LAUNCH_LANGUAGES\.map\(language/);
    expect(readFileSync('app/auth/signup-wizard.tsx', 'utf8')).toMatch(/LAUNCH_LANGUAGES\.map\(lang/);
  });
});
