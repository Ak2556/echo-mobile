import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Truncated translations shipped once and nothing noticed.
 *
 * scripts/translate_i18n.py seeded every language from the BENGALI block rather
 * than English and dropped the last character of each value. The result reached
 * users: 228 strings ending in a bare virama, which is orthographically
 * impossible in Devanagari, Bengali, Gurmukhi, Telugu, Kannada, Odia and
 * Malayalam, and 617 mixed-script strings cut mid-Latin-word — "नया Ech",
 * "En líne", "No leíd".
 *
 * These guard the file the generator now writes. The legacy static tables are
 * deliberately NOT asserted on: they are known-bad, they are a fallback rather
 * than the authority since the precedence flip in translate(), and failing on
 * them would only wedge CI on data a re-translation is meant to replace.
 */
const TRAILING_VIRAMA = /[्্੍્୍்్್്]$/;

async function generated() {
  const { GENERATED } = await import('../../../lib/i18nGenerated');
  return GENERATED as Record<string, Record<string, string>>;
}

describe('generated translations are well formed', () => {
  it('never ends a value in a bare virama', async () => {
    const bad: string[] = [];
    for (const [lang, map] of Object.entries(await generated())) {
      for (const [key, value] of Object.entries(map ?? {})) {
        if (TRAILING_VIRAMA.test(value)) bad.push(`${lang}.${key}=${JSON.stringify(value)}`);
      }
    }
    expect(bad, `truncated translations: ${bad.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('never emits an empty value', async () => {
    const empty: string[] = [];
    for (const [lang, map] of Object.entries(await generated())) {
      for (const [key, value] of Object.entries(map ?? {})) {
        if (value.trim() === '') empty.push(`${lang}.${key}`);
      }
    }
    expect(empty, `empty translations: ${empty.slice(0, 10).join(', ')}`).toEqual([]);
  });

  it('never emits the English string minus its last character', async () => {
    // The exact signature of the old bug.
    const src = readFileSync(join(process.cwd(), 'src/shared/lib/i18n.ts'), 'utf8');
    const a = src.indexOf('const BASE_TRANSLATIONS');
    const base: Record<string, string> = {};
    for (const m of src.slice(a, src.indexOf('} as const;', a)).matchAll(/'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
      base[m[1]] = m[2];
    }
    const cut: string[] = [];
    for (const [lang, map] of Object.entries(await generated())) {
      for (const [key, value] of Object.entries(map ?? {})) {
        const en = base[key];
        if (en && en.length > 1 && value === en.slice(0, -1)) cut.push(`${lang}.${key}`);
      }
    }
    expect(cut, `values that are English minus one char: ${cut.slice(0, 10).join(', ')}`).toEqual([]);
  });
});

describe('the generator can find what it reads', () => {
  it('points at files that exist', async () => {
    const src = readFileSync(join(process.cwd(), 'scripts/generate-i18n.mjs'), 'utf8');
    // It read lib/i18n.ts, gone since the shared/ move, so every run died on the
    // first read and left the generated table empty — with nothing failing.
    for (const m of src.matchAll(/join\(ROOT,\s*((?:'[^']+',?\s*)+)\)/g)) {
      const parts = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      const rel = join(...parts);
      if (rel.endsWith('i18nGenerated.ts')) continue; // written, not read
      expect(() => readFileSync(join(process.cwd(), rel), 'utf8'),
        `generate-i18n.mjs reads ${rel}, which does not exist`).not.toThrow();
    }
  });
});
