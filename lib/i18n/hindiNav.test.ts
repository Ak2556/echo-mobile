import { describe, expect, it } from 'vitest';
import { translate } from './i18n';

/**
 * The static Hindi nav strings were each cut by one character ("हो", "चै", "आ", "नया Ech"),
 * so the tab bar of the flagship language showed one or two letters per tab. The legacy
 * static tables are otherwise unchecked (see i18nIntegrity.test.ts), so the strings a user
 * sees on every screen are pinned here.
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
