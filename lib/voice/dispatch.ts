// Turns a parsed voice intent into an actual app action: navigation via the
// expo-router imperative API, or a store mutation (e.g. switching language).
// Pure module — safe to call from the voice controller. Never throws; returns a
// DispatchOutcome describing what happened and what to show/speak back.

import { router } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { APP_LANGUAGES, normalizeAppLanguage, type AppLanguageCode } from '../languages';
import { readFeedAloud } from './readFeed';
import type { VoiceResult } from './types';

// Spoken destination → route. Accepts a few synonyms the model might emit.
const DESTINATIONS: Record<string, string> = {
  home: '/(tabs)/home',
  feed: '/(tabs)/home',
  explore: '/(tabs)/explore',
  discover: '/(tabs)/explore',
  market: '/(tabs)/marketplace',
  marketplace: '/(tabs)/marketplace',
  chat: '/(tabs)/chat',
  messages: '/(tabs)/chat',
  you: '/(tabs)/you',
  profile: '/(tabs)/you',
  me: '/(tabs)/you',
  alerts: '/(tabs)/notifications',
  notifications: '/(tabs)/notifications',
  settings: '/settings',
  create: '/create-post',
  post: '/create-post',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Map a spoken language name / native name / code to a supported language.
function matchLanguage(spoken: string): AppLanguageCode | null {
  const q = spoken.trim().toLowerCase();
  if (!q) return null;
  for (const l of APP_LANGUAGES) {
    if (l.code.toLowerCase() === q) return l.code;
    if (l.englishName.toLowerCase() === q) return l.code;
    if (l.nativeName.toLowerCase() === q) return l.code;
  }
  for (const l of APP_LANGUAGES) {
    if (q.includes(l.englishName.toLowerCase()) || q.includes(l.nativeName.toLowerCase())) return l.code;
  }
  // Common Hindi words for the two most likely languages.
  const HINTS: Array<[string, AppLanguageCode]> = [
    ['हिंदी', 'hi'], ['हिन्दी', 'hi'], ['अंग्रेज़ी', 'en'], ['अंग्रेजी', 'en'], ['english', 'en'], ['hindi', 'hi'],
  ];
  for (const [k, code] of HINTS) if (q.includes(k.toLowerCase())) return code;
  return null;
}

export interface DispatchOutcome {
  handled: boolean;
  reply: string;
  navigatedTo?: string;
  /** True when the intent already produced speech (e.g. read_feed), so the
   *  caller should not also speak the reply. */
  spoken?: boolean;
}

export function dispatchVoiceIntent(result: VoiceResult): DispatchOutcome {
  const { intent, args } = result;
  const reply = result.reply;

  switch (intent) {
    case 'navigate': {
      const route = DESTINATIONS[str(args.destination).toLowerCase()];
      if (!route) return { handled: false, reply };
      router.push(route as never);
      return { handled: true, reply, navigatedTo: route };
    }

    case 'create_post': {
      const text = str(args.text);
      // Prefill the composer and let the user confirm before it goes public —
      // guards against mis-transcription posting the wrong thing.
      router.push({ pathname: '/create-post', params: text ? { prefillBody: text } : {} } as never);
      return { handled: true, reply, navigatedTo: '/create-post' };
    }

    case 'open_daily_question':
      router.push('/daily-question' as never);
      return { handled: true, reply, navigatedTo: '/daily-question' };

    case 'search': {
      const q = str(args.query);
      router.push({ pathname: '/(tabs)/explore', params: q ? { q } : {} } as never);
      return { handled: true, reply, navigatedTo: '/(tabs)/explore' };
    }

    case 'open_ai_chat': {
      const prompt = str(args.prompt);
      router.push({ pathname: '/(tabs)/chat', params: prompt ? { prompt } : {} } as never);
      return { handled: true, reply, navigatedTo: '/(tabs)/chat' };
    }

    case 'set_language': {
      const code = matchLanguage(str(args.language));
      if (!code) return { handled: false, reply };
      useAppStore.getState().setAppLanguage(normalizeAppLanguage(code));
      return { handled: true, reply };
    }

    case 'go_back':
      if (router.canGoBack()) router.back();
      return { handled: true, reply };

    // Read the current feed aloud, prefaced by the spoken reply. speakSequence
    // handles the whole run, so the caller shouldn't also speak the reply.
    case 'read_feed': {
      const count = readFeedAloud(reply);
      return { handled: count > 0, reply, spoken: true };
    }

    case 'help':
      return { handled: true, reply };

    case 'unknown':
    default:
      return { handled: false, reply };
  }
}
