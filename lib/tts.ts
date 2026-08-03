// Text-to-speech — on-device, free, offline, every supported language.
//
// Powers voice-first read-back: the app speaks its voice-command replies and can
// read any content aloud (feed, chat, daily answers). Uses the OS speech engine
// via expo-speech, so it costs nothing per utterance and scales to reading
// unlimited content.
//
// expo-speech is a native module; it's required lazily so a dev client that
// predates it keeps running (TTS simply no-ops until the next native build). Use
// isTtsAvailable() to hide UI affordances when it isn't present yet.

import { create } from 'zustand';
import { useAppStore } from '../store/useAppStore';
import { normalizeAppLanguage, type AppLanguageCode } from './languages';

type SpeechModule = typeof import('expo-speech');

let Speech: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Speech = require('expo-speech');
} catch {
  Speech = null;
}

/** True once the native module is present (i.e. after the next native build). */
export function isTtsAvailable(): boolean {
  return Speech != null && typeof Speech.speak === 'function';
}

// App language → a BCP-47 voice locale the OS speech engine understands. The OS
// picks its installed voice for that locale; unknown locales fall back to en-US.
const LOCALE: Record<AppLanguageCode, string> = {
  en: 'en-US', hi: 'hi-IN', bn: 'bn-IN', te: 'te-IN', mr: 'mr-IN', ta: 'ta-IN',
  ur: 'ur-PK', gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', pa: 'pa-IN', or: 'or-IN',
  as: 'as-IN', ne: 'ne-NP', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR',
  ar: 'ar-SA', id: 'id-ID', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ru: 'ru-RU',
  tr: 'tr-TR', vi: 'vi-VN',
};

export function localeFor(lang: AppLanguageCode): string {
  return LOCALE[lang] ?? 'en-US';
}

function currentLanguage(): AppLanguageCode {
  return normalizeAppLanguage(useAppStore.getState().appLanguage);
}

// Latin-script languages that read fine with their own voice; others fall back
// to English when the text is Latin.
const LATIN_LANGS = new Set<AppLanguageCode>(['en', 'es', 'fr', 'de', 'pt', 'id', 'tr', 'vi']);

/**
 * Guess the voice language from the text's script so read-aloud uses the right
 * voice for the CONTENT (e.g. an English post read in an English voice even if
 * the reader's UI is Hindi). Falls back to `fallback` (usually the app language).
 */
export function detectSpeechLang(text: string, fallback: AppLanguageCode): AppLanguageCode {
  if (/[ऀ-ॿ]/.test(text)) return 'hi'; // Devanagari (hi/mr/ne)
  if (/[؀-ۿ]/.test(text)) return 'ar'; // Arabic (ar/ur)
  if (/[ঀ-৿]/.test(text)) return 'bn'; // Bengali
  if (/[஀-௿]/.test(text)) return 'ta'; // Tamil
  if (/[ఀ-౿]/.test(text)) return 'te'; // Telugu
  if (/[ಀ-೿]/.test(text)) return 'kn'; // Kannada
  if (/[ഀ-ൿ]/.test(text)) return 'ml'; // Malayalam
  if (/[઀-૿]/.test(text)) return 'gu'; // Gujarati
  if (/[਀-੿]/.test(text)) return 'pa'; // Gurmukhi (Punjabi)
  if (/[଀-୿]/.test(text)) return 'or'; // Odia
  if (/[぀-ヿ]/.test(text)) return 'ja'; // Kana
  if (/[가-힯]/.test(text)) return 'ko'; // Hangul
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'; // Cyrillic
  if (/[一-鿿]/.test(text)) return 'zh'; // Han (rough → Chinese)
  return LATIN_LANGS.has(fallback) ? fallback : 'en';
}

// Reactive speaking state so UI can show which item is being read (or if any).
interface TtsState {
  speakingId: string | null;
}
export const useTtsStore = create<TtsState>(() => ({ speakingId: null }));

export interface SpeakOptions {
  /** Voice locale to use. Defaults to the app's current language. */
  language?: AppLanguageCode;
  /** Optional id so UI can reflect which specific item is speaking. */
  id?: string;
  /** Speaking rate (0.1–2.0). Default 1.0. */
  rate?: number;
  onDone?: () => void;
}

/**
 * Speak `text` aloud in the given (or current app) language. Interrupts any
 * current utterance — a single-speaker model keeps read-back predictable.
 */
export function speak(text: string, opts: SpeakOptions = {}) {
  const body = (text ?? '').trim();
  if (!isTtsAvailable() || !body) return;
  const id = opts.id ?? '_';
  // Cancel whatever's speaking first, then start this one.
  try { Speech!.stop(); } catch { /* ignore */ }
  useTtsStore.setState({ speakingId: id });
  const clear = () => {
    // Only clear if we're still the active utterance.
    if (useTtsStore.getState().speakingId === id) useTtsStore.setState({ speakingId: null });
  };
  // Explicit language wins; otherwise pick the voice from the text's script so
  // content reads in its own language, falling back to the reader's.
  const lang = opts.language ?? detectSpeechLang(body, currentLanguage());
  try {
    Speech!.speak(body, {
      language: localeFor(lang),
      rate: opts.rate ?? 1.0,
      pitch: 1.0,
      onDone: () => { clear(); opts.onDone?.(); },
      onStopped: clear,
      onError: clear,
    });
  } catch {
    clear();
  }
}

/** Stop any current speech. */
export function stopSpeaking() {
  if (!isTtsAvailable()) return;
  try { Speech!.stop(); } catch { /* ignore */ }
  useTtsStore.setState({ speakingId: null });
}

/** Toggle: speak `text`, or stop if this same id is already speaking. */
export function toggleSpeak(text: string, opts: SpeakOptions = {}) {
  const id = opts.id ?? '_';
  if (useTtsStore.getState().speakingId === id) {
    stopSpeaking();
  } else {
    speak(text, opts);
  }
}
