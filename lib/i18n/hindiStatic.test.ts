import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from './i18n';

/**
 * The static Hindi strings were each cut by one character ("हो", "चै", "से" for Save,
 * "रद्" for Cancel, "नया Ech"), so the tab bar, buttons and headings of the flagship
 * language showed fragments. The legacy static tables are otherwise unchecked (see
 * i18nIntegrity.test.ts), so the strings a user sees on every screen are pinned here.
 */
describe('Hindi navigation labels', () => {
  const expected = {
    'nav.home': 'होम',
    'nav.explore': 'खोजें',
    'nav.market': 'मार्केट',
    'nav.chat': 'चैट',
    'nav.you': 'आप',
    'nav.alerts': 'अलर्ट',
    'nav.tools': 'टूल्स',
    'nav.newEcho': 'नया Echo',
  } as const;

  for (const [key, value] of Object.entries(expected)) {
    it(`${key} reads ${value}`, () => {
      expect(translate(key as keyof typeof expected & Parameters<typeof translate>[0], 'hi')).toBe(value);
    });
  }
});

describe('Hindi shared strings', () => {
  const expected = {
    'common.back': 'पीछे',
    'common.done': 'हो गया',
    'common.cancel': 'रद्द करें',
    'common.save': 'सेव करें',
    'common.search': 'खोजें',
    'common.retry': 'फिर कोशिश करें',
    'common.loading': 'लोड हो रहा है',
    'settings.title': 'सेटिंग्स',
    'settings.editProfile': 'प्रोफ़ाइल संपादित करें',
    'settings.groups.display': 'डिस्प्ले',
    'explore.clear': 'साफ करें',
    'explore.searchPlaceholder': 'लोग, Echoes, विषय, टूल खोजें',
    'chat.recent': 'हालिया',
  } as const;

  for (const [key, value] of Object.entries(expected)) {
    it(`${key} reads ${value}`, () => {
      expect(translate(key as Parameters<typeof translate>[0], 'hi')).toBe(value);
    });
  }

  it('no value in the static Hindi common block ends in a bare virama', () => {
    const src = readFileSync(join(process.cwd(), 'lib/i18n/i18n.ts'), 'utf8');
    const start = src.indexOf('const COMMON_TRANSLATIONS');
    const hi = src.indexOf('  hi: {', start);
    const end = src.indexOf('\n  },', hi);
    const bad = [...src.slice(hi, end).matchAll(/^\s*'([^']+)':\s*"((?:[^"\\]|\\.)*)"/gm)]
      .filter(m => /\u094D$/.test(m[2]))
      .map(m => `${m[1]}=${m[2]}`);
    expect(bad).toEqual([]);
  });
});
