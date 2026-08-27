/**
 * Turning the app's language setting into a tag a speech recogniser accepts.
 *
 * `appLanguage` is a bare two-letter code — "en", "hi", "bn" — because that is
 * what the translation layer keys off. Android's SpeechRecognizer wants a
 * BCP-47 tag with a region ("en-IN", "hi-IN") and answers a bare code with
 * `language-not-supported`, which surfaces to the user as the command simply
 * not working.
 *
 * Regions lean Indian because that is who the app is for: a user whose phone
 * keyboard says English (India) is far better served by en-IN than en-US, both
 * for accent handling and for the offline model most likely to be installed.
 */

const REGION: Record<string, string> = {
  // Indian languages — all IN.
  hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN', te: 'te-IN', mr: 'mr-IN',
  gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', or: 'or-IN',
  as: 'as-IN', ur: 'ur-IN', ne: 'ne-NP', si: 'si-LK',
  // English defaults to India for the same reason.
  en: 'en-IN',
  // Everything else takes its most common region.
  ar: 'ar-SA', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR',
  ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', id: 'id-ID',
  vi: 'vi-VN', th: 'th-TH', tr: 'tr-TR', it: 'it-IT', nl: 'nl-NL',
};

/** Safe default when the setting is missing or unrecognised. */
export const FALLBACK_LOCALE = 'en-IN';

export function toSpeechLocale(appLanguage: string | null | undefined): string {
  if (!appLanguage) return FALLBACK_LOCALE;

  const raw = String(appLanguage).trim().replace('_', '-');
  if (!raw) return FALLBACK_LOCALE;

  // Already regioned ("en-IN", "pt-BR"): normalise casing and keep it. The user
  // or the device chose that region and it is more specific than our guess.
  const parts = raw.split('-');
  if (parts.length >= 2 && parts[1]) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  const base = parts[0].toLowerCase();
  return REGION[base] ?? FALLBACK_LOCALE;
}
