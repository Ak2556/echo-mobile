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
