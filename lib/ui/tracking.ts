import { useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { normalizeAppLanguage, type AppLanguageCode } from '../i18n/languages';

/**
 * Letter-spacing belongs to Latin type. On Devanagari (and other Indic, Arabic
 * and CJK scripts) a negative value drags vowel signs under the next letter, so
 * "वापसी पर स्वागत है" reads "वापसा पर स्वागत ह", and a positive value pulls the
 * syllables apart. Pass every letterSpacing through this so other scripts get 0.
 */
const LATIN_SCRIPT: ReadonlySet<AppLanguageCode> = new Set(['en', 'es', 'fr', 'de', 'pt', 'id', 'tr', 'vi']);

export function trackingFor(language: AppLanguageCode, value: number): number {
  return LATIN_SCRIPT.has(language) ? value : 0;
}

export function useTracking(): (value: number) => number {
  const language = useAppStore(s => normalizeAppLanguage(s.appLanguage));
  return useCallback((value: number) => trackingFor(language, value), [language]);
}

/**
 * Devanagari carries marks above and below the line (ी, ै, ु). A line height at
 * or under the font size clips them: the Home welcome rendered "वापसी पर स्वागत
 * है" as "वापसा पर स्वागत ह". Latin keeps its tight leading; other scripts get
 * at least 1.4x the font size.
 */
export function leadingFor(language: AppLanguageCode, fontSize: number, latinLineHeight: number): number {
  return LATIN_SCRIPT.has(language) ? latinLineHeight : Math.max(latinLineHeight, Math.round(fontSize * 1.4));
}

export function useLeading(): (fontSize: number, latinLineHeight: number) => number {
  const language = useAppStore(s => normalizeAppLanguage(s.appLanguage));
  return useCallback((fontSize: number, latinLineHeight: number) => leadingFor(language, fontSize, latinLineHeight), [language]);
}
