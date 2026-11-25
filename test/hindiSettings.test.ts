import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TT_PHRASES } from '../lib/i18n/i18nPhrases';
import { FONT_STYLE_OPTIONS } from '../lib/ui/fontPresets';
import { THEMES } from '../lib/ui/theme';

// 2026-11-25: with Hindi selected, Settings still showed "Blocked Users (0)",
// "Everyone", "Medium", "Editorial", "Voice captions", English picker options and
// 31 other lines. Hindi is a launch language, and the runtime machine translation
// depends on the AI quota, so every string on this screen needs a static Hindi line.

const hi = (TT_PHRASES as Record<string, Record<string, string> | undefined>).hi ?? {};
const src = readFileSync('app/settings.tsx', 'utf8');
const literals = (re: RegExp) => [...new Set([...src.matchAll(re)].map(m => m[2]))];
const missing = (list: string[]) => list.filter(s => !hi[s]);

describe('Settings in Hindi', () => {
  it('has Hindi for every ttx() string', () => {
    const strings = literals(/ttx\((["'`])((?:(?!\1).)+)\1\)/g);
    expect(strings.length).toBeGreaterThan(100);
    expect(missing(strings)).toEqual([]);
  });

  it('has Hindi for every picker option label and description', () => {
    const strings = [
      ...literals(/\blabel: (['"])((?:(?!\1).)+)\1/g),
      ...literals(/\bdesc: (['"])((?:(?!\1).)+)\1/g),
    ];
    expect(strings.length).toBeGreaterThan(10);
    expect(missing(strings)).toEqual([]);
  });

  it('has Hindi for every font style and theme name', () => {
    const strings = [
      ...FONT_STYLE_OPTIONS.flatMap(o => [o.label, (o as { desc?: string }).desc].filter(Boolean) as string[]),
      ...Object.values(THEMES).map(t => (t as { name: string }).name),
    ];
    expect(missing(strings)).toEqual([]);
  });

  it('leaves no raw English in dialogs, subtitles or counters', () => {
    // A raw literal never reaches ttx, so the Hindi table cannot help it.
    expect(src.match(/^\s+(title|message|confirmLabel): (['"]|`(?!\$\{ttx\())/gm) ?? []).toEqual([]);
    expect(src.match(/subtitle: ['"`][A-Z]/g) ?? []).toEqual([]);
    expect(src.match(/subtitle=\{[^}]*\? ['"][A-Z]/g) ?? []).toEqual([]);
    expect(src.match(/label=\{`[A-Z][a-z]+[^`$]*\(\$\{/g) ?? []).toEqual([]);
  });

  it('translates option rows, value badges and counters instead of drawing them raw', () => {
    expect(src).toMatch(/opt\.label \? ttx\(opt\.label\)/);
    expect(src).toMatch(/\{ttx\(opt\.desc\)\}/);
    expect(src).not.toMatch(/`Blocked Users \(/);
    expect(src).not.toMatch(/`Muted Users \(/);
    expect(src).not.toMatch(/— tap to change`/);
    for (const map of ['fontLabel', 'bubbleLabel', 'dmLabel', 'cornerLabel', 'themeLabel']) {
      expect(src, map).toMatch(new RegExp(`const ${map} = ttx\\(`));
    }
    for (const s of ['Blocked Users', 'Muted Users', '{theme} — tap to change', 'Slow', 'Normal', 'Fast']) {
      expect(hi[s], s).toBeTruthy();
    }
  });
});
