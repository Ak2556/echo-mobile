export type AppLanguageCode =
  | 'en'
  | 'hi'
  | 'bn'
  | 'te'
  | 'mr'
  | 'ta'
  | 'ur'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'pa'
  | 'or'
  | 'as'
  | 'ne'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ar'
  | 'id'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'ru'
  | 'tr'
  | 'vi';

export interface LanguageOption {
  code: AppLanguageCode;
  englishName: string;
  nativeName: string;
  region: 'India' | 'Global';
  rtl?: boolean;
}

export const DEFAULT_APP_LANGUAGE: AppLanguageCode = 'en';

export const APP_LANGUAGES: LanguageOption[] = [
  { code: 'en', englishName: 'English', nativeName: 'English', region: 'Global' },
  { code: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', region: 'India' },
  { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', region: 'India' },
  { code: 'te', englishName: 'Telugu', nativeName: 'తెలుగు', region: 'India' },
  { code: 'mr', englishName: 'Marathi', nativeName: 'मराठी', region: 'India' },
  { code: 'ta', englishName: 'Tamil', nativeName: 'தமிழ்', region: 'India' },
  { code: 'ur', englishName: 'Urdu', nativeName: 'اردو', region: 'India', rtl: true },
  { code: 'gu', englishName: 'Gujarati', nativeName: 'ગુજરાતી', region: 'India' },
  { code: 'kn', englishName: 'Kannada', nativeName: 'ಕನ್ನಡ', region: 'India' },
  { code: 'ml', englishName: 'Malayalam', nativeName: 'മലയാളം', region: 'India' },
  { code: 'pa', englishName: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', region: 'India' },
  { code: 'or', englishName: 'Odia', nativeName: 'ଓଡ଼ିଆ', region: 'India' },
  { code: 'as', englishName: 'Assamese', nativeName: 'অসমীয়া', region: 'India' },
  { code: 'ne', englishName: 'Nepali', nativeName: 'नेपाली', region: 'India' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', region: 'Global' },
  { code: 'fr', englishName: 'French', nativeName: 'Français', region: 'Global' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', region: 'Global' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português', region: 'Global' },
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', region: 'Global', rtl: true },
  { code: 'id', englishName: 'Indonesian', nativeName: 'Bahasa Indonesia', region: 'Global' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', region: 'Global' },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', region: 'Global' },
  { code: 'zh', englishName: 'Chinese', nativeName: '中文', region: 'Global' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', region: 'Global' },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', region: 'Global' },
  { code: 'vi', englishName: 'Vietnamese', nativeName: 'Tiếng Việt', region: 'Global' },
];

export const CONTENT_LANGUAGE_OPTIONS = APP_LANGUAGES.map(language => ({
  label: `${language.englishName} (${language.nativeName})`,
  value: language.englishName,
  desc: language.region === 'India' ? 'Indian language' : 'Global language',
}));

export function normalizeAppLanguage(value: unknown): AppLanguageCode {
  return APP_LANGUAGES.some(language => language.code === value)
    ? value as AppLanguageCode
    : DEFAULT_APP_LANGUAGE;
}

export function languageByCode(code: AppLanguageCode): LanguageOption {
  return APP_LANGUAGES.find(language => language.code === code) ?? APP_LANGUAGES[0];
}

export function languageLabel(code: AppLanguageCode): string {
  const language = languageByCode(code);
  return `${language.englishName} (${language.nativeName})`;
}

export function assistantLanguageInstruction(code: AppLanguageCode): string {
  const language = languageByCode(code);
  if (language.code === 'en') {
    return 'Reply in English unless the user explicitly asks for another language.';
  }
  return `Reply in ${language.englishName} (${language.nativeName}) by default. Keep app actions, tool previews, and explanations concise and natural for that language. If the user writes in another language, follow the user's latest language.`;
}
