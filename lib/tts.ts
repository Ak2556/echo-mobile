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

import { AppState } from 'react-native';
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

function currentRate(): number {
  const r = (useAppStore.getState() as { speechRate?: number }).speechRate;
  return typeof r === 'number' && r >= 0.5 && r <= 1.5 ? r : 1.0;
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
  paused: boolean;
}
export const useTtsStore = create<TtsState>(() => ({ speakingId: null, paused: false }));

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
 * Turn display text into something that sounds natural spoken: drop Markdown,
 * code, links and image syntax; keep the words of @mentions / #tags. Without
 * this the engine literally reads "asterisk asterisk" and full URLs aloud.
 */
export function cleanForSpeech(input: string): string {
  const raw = input ?? '';
  try {
    let s = raw;
    s = s.replace(/```[\s\S]*?```/g, '. ');          // fenced code blocks → pause
    s = s.replace(/`([^`]+)`/g, '$1');               // inline code → its text
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');      // images → nothing
    s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');    // links → link text
    s = s.replace(/https?:\/\/\S+/g, ' ');           // bare URLs → nothing
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');         // heading markers
    s = s.replace(/[@#](\w+)/g, '$1');               // @mentions / #tags → the word
    s = s.replace(/[*_~`>|]/g, '');                  // leftover Markdown symbols
    // Emoji & pictographs read as their names ("fire fire fire") — drop them.
    s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/gu, '');
    s = s.replace(/[\uFE0F\u200D\u2190-\u21FF]/g, ''); // variation selectors, ZWJ, arrows
    s = s.replace(/([!?.,])\1{2,}/g, '$1');           // "!!!" → "!"
    s = s.replace(/\n{2,}/g, '. ');                   // paragraph breaks → a pause
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch {
    // Any regex-engine hiccup — fall back to a simple collapse.
    return raw.replace(/\s+/g, ' ').trim();
  }
}

/**
 * Split into speakable chunks (~180 chars, on sentence boundaries). expo-speech
 * can truncate or choke on very long single utterances, especially on iOS;
 * queueing sentence-sized pieces is reliable and lets stop() cut in cleanly.
 */
export function chunkText(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+|\S[^.!?。！？]*$/g) ?? [text];
  const chunks: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if ((buf + ' ' + sentence).trim().length > max && buf) { chunks.push(buf.trim()); buf = sentence; }
    else buf = (buf ? buf + ' ' : '') + sentence;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// Best available voice per locale, resolved once and cached. iOS ships higher
// quality "Enhanced/Premium" voices that sound far better than the default —
// prefer those. Populated lazily in the background; the first utterance may use
// the OS default, every one after uses the best voice.
const voiceForLocale: Record<string, string | undefined> = {};
let voicesLoading = false;
let voicesReady = false;

function loadVoices() {
  if (voicesLoading || voicesReady || !Speech?.getAvailableVoicesAsync) return;
  voicesLoading = true;
  Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const rank = (q: unknown) => (q === 'Premium' || q === 3 ? 3 : q === 'Enhanced' || q === 2 ? 2 : 1);
      const best: Record<string, { id: string; score: number }> = {};
      for (const v of voices ?? []) {
        const loc = (v.language ?? '').toLowerCase();
        if (!loc) continue;
        const score = rank((v as { quality?: unknown }).quality);
        if (!best[loc] || score > best[loc].score) best[loc] = { id: v.identifier, score };
      }
      for (const [loc, val] of Object.entries(best)) voiceForLocale[loc] = val.id;
      voicesReady = true;
    })
    .catch(() => { /* fall back to default voices */ })
    .finally(() => { voicesLoading = false; });
}

function bestVoice(locale: string): string | undefined {
  const l = locale.toLowerCase();
  if (voiceForLocale[l]) return voiceForLocale[l];
  const prefix = l.split('-')[0];
  const hit = Object.keys(voiceForLocale).find((k) => k.startsWith(prefix));
  return hit ? voiceForLocale[hit] : undefined;
}

/**
 * Speak `text` aloud in the given (or content-detected) language. Cleans the
 * text, queues it in sentence-sized chunks, and uses the best available voice.
 * Interrupts any current utterance — a single-speaker model keeps it predictable.
 */
export function speak(text: string, opts: SpeakOptions = {}) {
  const body = cleanForSpeech(text);
  if (!isTtsAvailable() || !body) return;
  loadVoices();
  const id = opts.id ?? '_';
  try { Speech!.stop(); } catch { /* ignore */ }
  useTtsStore.setState({ speakingId: id, paused: false });
  const clear = () => {
    if (useTtsStore.getState().speakingId === id) useTtsStore.setState({ speakingId: null, paused: false });
  };

  // Explicit language wins; otherwise pick from the text's script so content
  // reads in its own language, falling back to the reader's.
  const lang = opts.language ?? detectSpeechLang(body, currentLanguage());
  const locale = localeFor(lang);
  const voice = bestVoice(locale);
  const chunks = chunkText(body);

  try {
    chunks.forEach((chunk, i) => {
      const last = i === chunks.length - 1;
      Speech!.speak(chunk, {
        language: locale,
        voice,
        rate: opts.rate ?? currentRate(),
        pitch: 1.0,
        onDone: last ? () => { clear(); opts.onDone?.(); } : undefined,
        onStopped: last ? clear : undefined,
        onError: clear,
      });
    });
    if (chunks.length === 0) clear();
  } catch {
    clear();
  }
}

/**
 * Speak several segments back-to-back as one session, each detected and voiced
 * in its OWN language — so a mixed-language run (e.g. reading a feed of Hindi and
 * English posts) reads each post correctly. Powers "read the feed to me".
 */
export function speakSequence(segments: string[], opts: { id?: string; language?: AppLanguageCode } = {}) {
  const cleaned = segments.map(cleanForSpeech).filter(Boolean);
  if (!isTtsAvailable() || cleaned.length === 0) return;
  loadVoices();
  const id = opts.id ?? '_';
  try { Speech!.stop(); } catch { /* ignore */ }
  useTtsStore.setState({ speakingId: id, paused: false });
  const clear = () => {
    if (useTtsStore.getState().speakingId === id) useTtsStore.setState({ speakingId: null, paused: false });
  };
  const rate = currentRate();

  // Flatten into per-language, sentence-sized utterances, preserving order.
  const utterances: { text: string; locale: string; voice?: string }[] = [];
  for (const seg of cleaned) {
    const lang = opts.language ?? detectSpeechLang(seg, currentLanguage());
    const locale = localeFor(lang);
    const voice = bestVoice(locale);
    for (const chunk of chunkText(seg)) utterances.push({ text: chunk, locale, voice });
  }

  try {
    utterances.forEach((u, i) => {
      const last = i === utterances.length - 1;
      Speech!.speak(u.text, {
        language: u.locale,
        voice: u.voice,
        rate,
        pitch: 1.0,
        onDone: last ? clear : undefined,
        onStopped: last ? clear : undefined,
        onError: clear,
      });
    });
  } catch {
    clear();
  }
}

/** Stop any current speech. */
export function stopSpeaking() {
  if (!isTtsAvailable()) return;
  try { Speech!.stop(); } catch { /* ignore */ }
  useTtsStore.setState({ speakingId: null, paused: false });
}

/** Pause the current speech (iOS; no-op where unsupported). */
export function pauseSpeaking() {
  if (!isTtsAvailable() || useTtsStore.getState().speakingId == null) return;
  try { Speech!.pause?.(); useTtsStore.setState({ paused: true }); } catch { /* unsupported */ }
}

/** Resume paused speech. */
export function resumeSpeaking() {
  if (!isTtsAvailable()) return;
  try { Speech!.resume?.(); useTtsStore.setState({ paused: false }); } catch { /* unsupported */ }
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

// Never leave speech running in the background — stop when the app is backgrounded.
try {
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') stopSpeaking();
  });
} catch {
  /* AppState unavailable (e.g. tests) — safe to ignore */
}
