// Runtime UI localization engine.
//
// Any string with no hand-authored translation for the currently-selected
// language is translated on demand by the i18n-translate edge function and
// cached — in an in-memory map (read during render, safe & synchronous), backed
// by MMKV so a string is translated only once, ever, per language.
//
// Reactivity: a Zustand `version` counter bumps whenever new translations land,
// so useI18n re-renders and re-resolves its strings. The cache itself lives
// outside React (module scope) so reads never touch the store during render.

import { create } from 'zustand';
import { persistGet, persistSet } from '../store/persist';
import { supabase } from './supabase';
import { languageByCode, type AppLanguageCode } from './languages';

type LangMap = Record<string, string>;

const mmkvKey = (lang: string) => `i18nRuntime:${lang}`;

// Source of truth for reads. Hydrated lazily & synchronously from MMKV.
const memCache: Record<string, LangMap> = {};

function ensureHydrated(lang: string) {
  if (memCache[lang]) return;
  memCache[lang] = persistGet<LangMap>(mmkvKey(lang), {});
}

/** Cached runtime translation template, or undefined if not (yet) available. */
export function getRuntime(lang: AppLanguageCode, key: string): string | undefined {
  if (lang === 'en') return undefined;
  ensureHydrated(lang);
  return memCache[lang][key];
}

// A tiny store whose only job is to trigger re-renders when translations arrive.
interface RuntimeSignal {
  version: number;
}
export const useI18nRuntime = create<RuntimeSignal>(() => ({ version: 0 }));

function commit(lang: string, entries: LangMap) {
  ensureHydrated(lang);
  memCache[lang] = { ...memCache[lang], ...entries };
  persistSet(mmkvKey(lang), memCache[lang]);
  useI18nRuntime.setState((s) => ({ version: s.version + 1 }));
}

// ---- batching queue (module-level, outside React) ----

const pending: Record<string, Map<string, string>> = {};  // lang → key→englishSource
// Keys already sent this session (success or failure) — prevents a retry storm
// while English is showing during the async round trip.
const attempted: Record<string, Set<string>> = {};
// Bounded retries for keys the model omits, so one dropped key can recover
// within the session without looping forever.
const retryCount: Record<string, Map<string, number>> = {};
const MAX_RETRIES = 2;
let timer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY = 250;
const MAX_PER_REQUEST = 150;

/**
 * Queue a missing string for translation. Safe to call during render — it never
 * touches React state synchronously; only the async flush does. No-op for
 * English or an already-cached / already-attempted key.
 */
export function ensureTranslation(lang: AppLanguageCode, key: string, englishSource: string) {
  if (lang === 'en' || !englishSource) return;
  if (getRuntime(lang, key) !== undefined) return;
  if (attempted[lang]?.has(key)) return;
  (pending[lang] ??= new Map()).set(key, englishSource);
  if (!timer) timer = setTimeout(flush, BATCH_DELAY);
}

async function flush() {
  timer = null;
  for (const lang of Object.keys(pending)) {
    const map = pending[lang];
    delete pending[lang];
    if (!map || map.size === 0) continue;

    const all = Array.from(map.entries()).slice(0, MAX_PER_REQUEST);
    (attempted[lang] ??= new Set());
    const items: LangMap = {};
    for (const [k, v] of all) { items[k] = v; attempted[lang].add(k); }

    try {
      const languageName = languageByCode(lang as AppLanguageCode).englishName;
      const { data, error } = await supabase.functions.invoke('i18n-translate', {
        body: { language: lang, languageName, items },
      });
      if (error) throw error;
      const translations = (data?.translations ?? {}) as LangMap;
      if (Object.keys(translations).length > 0) commit(lang, translations);
      // A key the model omitted stays English — allow a bounded number of
      // retries so a single dropped key recovers without an infinite loop.
      const counts = (retryCount[lang] ??= new Map());
      for (const [k] of all) {
        if (translations[k] !== undefined) continue;
        const n = (counts.get(k) ?? 0) + 1;
        counts.set(k, n);
        if (n < MAX_RETRIES) attempted[lang].delete(k);
      }
    } catch {
      // Leave English; `attempted` blocks a retry storm this session. A fresh
      // launch retries anything still uncached.
    }
  }
  if (Object.keys(pending).length > 0 && !timer) timer = setTimeout(flush, BATCH_DELAY);
}
