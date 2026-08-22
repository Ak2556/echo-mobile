/**
 * The 22 languages of the Eighth Schedule to the Constitution of India.
 *
 * WHY THIS EXISTS
 * The Digital Personal Data Protection Act, 2023 requires that the notice given
 * to a Data Principal be available in English **or any language listed in the
 * Eighth Schedule**, at the Data Principal's option. Counsel asked for the legal
 * documents to be readable in all 22 so that no user can be told their language
 * is unavailable.
 *
 * This list is deliberately SEPARATE from `lib/languages.ts` (the app's UI
 * locales). They answer different questions:
 *
 *   lib/languages.ts        → what language is the interface drawn in? (26)
 *   this file               → what language can the legal notice be read in? (22)
 *
 * Only 13 of the 22 overlap. Keeping them apart means we can satisfy the statute
 * without shipping nine half-supported UI locales.
 */

export interface EighthScheduleLanguage {
  /** BCP-47 code used for the translation file name and the picker. */
  code: string;
  /** Name in English. */
  englishName: string;
  /** Endonym — what speakers call it. Shown first in the picker. */
  nativeName: string;
  /** Writing system, which is what decides whether a device can render it. */
  script: string;
  /** True when the app already ships this as a full UI locale. */
  isAppLocale: boolean;
  /**
   * Devices commonly lack a font for these scripts, so the text renders as
   * empty boxes. See docs note in scripts/generate-legal-translations.mjs.
   */
  needsBundledFont?: boolean;
}

export const EIGHTH_SCHEDULE_LANGUAGES: readonly EighthScheduleLanguage[] = [
  { code: 'as',  englishName: 'Assamese',  nativeName: 'অসমীয়া',    script: 'Bengali-Assamese', isAppLocale: true  },
  { code: 'bn',  englishName: 'Bengali',   nativeName: 'বাংলা',      script: 'Bengali',          isAppLocale: true  },
  { code: 'brx', englishName: 'Bodo',      nativeName: 'बर’',        script: 'Devanagari',       isAppLocale: false },
  { code: 'doi', englishName: 'Dogri',     nativeName: 'डोगरी',      script: 'Devanagari',       isAppLocale: false },
  { code: 'gu',  englishName: 'Gujarati',  nativeName: 'ગુજરાતી',    script: 'Gujarati',         isAppLocale: true  },
  { code: 'hi',  englishName: 'Hindi',     nativeName: 'हिन्दी',      script: 'Devanagari',       isAppLocale: true  },
  { code: 'kn',  englishName: 'Kannada',   nativeName: 'ಕನ್ನಡ',      script: 'Kannada',          isAppLocale: true  },
  { code: 'ks',  englishName: 'Kashmiri',  nativeName: 'کٲشُر',      script: 'Perso-Arabic',     isAppLocale: false },
  { code: 'kok', englishName: 'Konkani',   nativeName: 'कोंकणी',     script: 'Devanagari',       isAppLocale: false },
  { code: 'mai', englishName: 'Maithili',  nativeName: 'मैथिली',      script: 'Devanagari',       isAppLocale: false },
  { code: 'ml',  englishName: 'Malayalam', nativeName: 'മലയാളം',     script: 'Malayalam',        isAppLocale: true  },
  { code: 'mni', englishName: 'Manipuri',  nativeName: 'ꯃꯅꯤꯄꯨꯔꯤ',     script: 'Meitei Mayek',     isAppLocale: false, needsBundledFont: true },
  { code: 'mr',  englishName: 'Marathi',   nativeName: 'मराठी',      script: 'Devanagari',       isAppLocale: true  },
  { code: 'ne',  englishName: 'Nepali',    nativeName: 'नेपाली',      script: 'Devanagari',       isAppLocale: true  },
  { code: 'or',  englishName: 'Odia',      nativeName: 'ଓଡ଼ିଆ',       script: 'Odia',             isAppLocale: true  },
  { code: 'pa',  englishName: 'Punjabi',   nativeName: 'ਪੰਜਾਬੀ',      script: 'Gurmukhi',         isAppLocale: true  },
  { code: 'sa',  englishName: 'Sanskrit',  nativeName: 'संस्कृतम्',    script: 'Devanagari',       isAppLocale: false },
  { code: 'sat', englishName: 'Santali',   nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',    script: 'Ol Chiki',         isAppLocale: false, needsBundledFont: true },
  { code: 'sd',  englishName: 'Sindhi',    nativeName: 'سنڌي',       script: 'Perso-Arabic',     isAppLocale: false },
  { code: 'ta',  englishName: 'Tamil',     nativeName: 'தமிழ்',       script: 'Tamil',            isAppLocale: true  },
  { code: 'te',  englishName: 'Telugu',    nativeName: 'తెలుగు',      script: 'Telugu',           isAppLocale: true  },
  { code: 'ur',  englishName: 'Urdu',      nativeName: 'اردو',       script: 'Perso-Arabic',     isAppLocale: true  },
] as const;

/** English is the authoritative text (Terms §25); it is not part of the 22. */
export const LEGAL_AUTHORITATIVE = { code: 'en', englishName: 'English', nativeName: 'English' } as const;

/** Every language a legal document must be obtainable in, English first. */
export const LEGAL_LANGUAGE_CODES: readonly string[] = [
  LEGAL_AUTHORITATIVE.code,
  ...EIGHTH_SCHEDULE_LANGUAGES.map(l => l.code),
];

/** Scripts that will not render on a stock device without a bundled font. */
export const LANGUAGES_NEEDING_FONTS = EIGHTH_SCHEDULE_LANGUAGES.filter(l => l.needsBundledFont);

/** The nine that are not yet full UI locales — legal documents only, for now. */
export const LEGAL_ONLY_LANGUAGES = EIGHTH_SCHEDULE_LANGUAGES.filter(l => !l.isAppLocale);

export function findEighthScheduleLanguage(code: string): EighthScheduleLanguage | undefined {
  return EIGHTH_SCHEDULE_LANGUAGES.find(l => l.code === code);
}
