import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Every placeholder in a translated string has to survive translation.
 *
 * formatTranslation replaces {name}, {username}, {items} and so on by exact
 * match. A placeholder that lost its closing brace is never substituted, so the
 * reader sees the literal text instead of their own name:
 *
 *   'home.welcomeBack': "वापसी पर स्वागत है, {name"     → "…, {name"
 *   'feed.mutedToast':  "म्यूट किया @{username"          → "म्यूट किया @{username"
 *
 * 86 strings were in that state across 23 languages, including the greeting on
 * the home screen — the first line a Hindi or Bengali speaker reads. For a
 * product whose whole argument is that the interface belongs to the reader,
 * this is the worst possible place to leak syntax.
 *
 * The other shape this catches is a translated variable name: Indonesian had
 * "Bisukan @{nama pengguna", where the identifier itself was translated and
 * would never have matched.
 */

const SOURCES = [
  'src/shared/lib/i18n.ts',
  'lib/i18nPhrases.ts',
  'lib/i18nGenerated.ts',
];

/** A well-formed placeholder: {identifier}. */
const WELL_FORMED = /^\{[a-zA-Z_][a-zA-Z0-9_]*\}$/;

interface Broken { file: string; line: number; key: string; value: string; }

function brokenPlaceholders(): Broken[] {
  const broken: Broken[] = [];

  for (const file of SOURCES) {
    let src: string;
    try {
      src = readFileSync(resolve(__dirname, '..', file), 'utf8');
    } catch {
      continue; // Generated files are not always present.
    }

    for (const entry of src.matchAll(/'([a-zA-Z0-9_.]+)':\s*("[^"]*"|'[^']*')/g)) {
      const key = entry[1];
      const value = entry[2].slice(1, -1);
      if (!value.includes('{')) continue;

      // Take each '{' and the run of characters that could form a placeholder.
      for (const open of value.matchAll(/\{[^{}]*\}?/g)) {
        if (WELL_FORMED.test(open[0])) continue;
        broken.push({
          file,
          line: src.slice(0, entry.index).split('\n').length,
          key,
          value,
        });
        break;
      }
    }
  }
  return broken;
}

describe('translation placeholders', () => {
  it('are closed and keep their identifier in every language', () => {
    const broken = brokenPlaceholders();
    const report = broken.map(b => `${b.file}:${b.line} ${b.key} → ${b.value}`);
    expect(report, 'a placeholder that is not exactly {identifier} is shown to the reader verbatim').toEqual([]);
  });
});
