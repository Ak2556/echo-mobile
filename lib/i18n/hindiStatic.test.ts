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
    'settings.editProfile': 'प्रोफ़ाइल बदलें', // short enough for the narrow Settings card
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

/**
 * The login screen is the first thing a Hindi user sees, and its strings had been cut by
 * one to several characters ("फो", "त्रुट", "ईमेल से साइन इ") with the final nasal of every
 * polite verb dropped ("जारी रखे"). Every auth key is pinned so a truncation cannot return.
 */
describe('Hindi sign-in strings', () => {
  const expected = {
    'auth.loginQuestionLabel': 'संभाल कर रखने लायक सवाल',
    'auth.continueGoogle': 'Google से जारी रखें',
    'auth.signingIn': 'साइन इन हो रहा है...',
    'auth.continueEmail': 'ईमेल से जारी रखें',
    'auth.continuePhone': 'फ़ोन से जारी रखें',
    'auth.orSignInWith': 'या साइन इन करें',
    'auth.phone': 'फ़ोन',
    'auth.termsPrefix': 'जारी रखकर आप इनसे सहमत हैं:',
    'auth.terms': 'शर्तें',
    'auth.privacy': 'प्राइवेसी',
    'auth.appReview': 'ऐप रिव्यू',
    'auth.openDemo': 'डेमो अकाउंट खोलें',
    'auth.demoUnavailable': 'डेमो साइन-इन उपलब्ध नहीं है',
    'auth.error': 'त्रुटि',
    'auth.emailTitle': 'ईमेल से साइन इन करें',
    'auth.emailBody': 'हम आपके इनबॉक्स में 6 अंकों का कोड भेजेंगे',
    'auth.phoneTitle': 'फ़ोन से साइन इन करें',
    'auth.phoneBody': 'हम आपको 6 अंकों का कोड भेजेंगे। देश कोड शामिल करें',
    'auth.sendCode': 'कोड भेजें',
    'auth.enterCode': 'कोड डालें',
    'auth.sentTo': 'भेजा गया:',
    'auth.verify': 'वेरिफ़ाई करें',
    'auth.verifyCode': 'कोड वेरिफ़ाई करें',
    'auth.resendCode': 'कोड फिर भेजें',
    'auth.resendIn': '{count}s में फिर भेजें',
    'auth.resendInSeconds': '{count} सेकंड में फिर भेजें',
  } as const;

  for (const [key, value] of Object.entries(expected)) {
    it(`${key} reads ${value}`, () => {
      expect(translate(key as Parameters<typeof translate>[0], 'hi')).toBe(value);
    });
  }

  it('every English auth key has a Hindi value, and none ends in a bare virama', () => {
    const src = readFileSync(join(process.cwd(), 'lib/i18n/i18n.ts'), 'utf8');
    const en = [...src.slice(0, src.indexOf('const AUTH_TRANSLATIONS')).matchAll(/^\s*'(auth\.[^']+)':/gm)].map(m => m[1]);
    const start = src.indexOf('const AUTH_TRANSLATIONS');
    const hi = src.indexOf('  hi: {', start);
    const end = src.indexOf('\n  },', hi);
    const values = new Map([...src.slice(hi, end).matchAll(/^\s*'([^']+)':\s*"((?:[^"\\]|\\.)*)"/gm)].map(m => [m[1], m[2]]));
    expect(en.filter(k => !values.has(k))).toEqual([]);
    expect([...values].filter(([, v]) => /्$/.test(v)).map(([k]) => k)).toEqual([]);
  });
});
