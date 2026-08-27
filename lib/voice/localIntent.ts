import type { VoiceResult } from './types';

/**
 * Matching a spoken command on the device, without asking a server.
 *
 * The voice loop used to send every utterance to a model that did transcription
 * and intent together, so even "go home" cost a network round trip plus
 * inference — measured at roughly a quarter of a second before the function did
 * any work at all, and over a second in practice. Most commands people actually
 * repeat are a handful of fixed phrases. Those should never leave the phone.
 *
 * This runs against a transcript produced by on-device speech recognition. A
 * confident match dispatches immediately; anything else returns null and the
 * cloud path handles it, so unusual phrasing still works — it is a fast path,
 * not a replacement.
 *
 * Bias: a miss is cheap (fall through to the model), a wrong match is not
 * (the app does something the user did not ask for). So matching is
 * deliberately conservative — whole-phrase, length-capped, no fuzzy scoring.
 */

/** Longer than this is a sentence, not a command; let the model read it. */
const MAX_WORDS = 6;

type Rule = {
  /** Phrases that must appear. Matched on word boundaries, not substrings. */
  any: string[];
  intent: VoiceResult['intent'];
  args?: Record<string, unknown>;
  reply: string;
};

/**
 * Hindi appears in Devanagari and romanised — people type and speak both, and
 * on-device recognition returns whichever the keyboard/locale produces.
 */
const RULES: Rule[] = [
  // ── navigation ────────────────────────────────────────────────────────────
  { any: ['home', 'होम', 'ghar'], intent: 'navigate', args: { destination: 'home' }, reply: 'Home' },
  { any: ['explore', 'search', 'खोज', 'ढूंढ'], intent: 'navigate', args: { destination: 'explore' }, reply: 'Explore' },
  { any: ['flow', 'videos', 'video', 'वीडियो'], intent: 'navigate', args: { destination: 'watch' }, reply: 'Flow' },
  { any: ['chat', 'assistant', 'चैट'], intent: 'navigate', args: { destination: 'chat' }, reply: 'Chat' },
  { any: ['tools', 'apps', 'टूल'], intent: 'navigate', args: { destination: 'apps' }, reply: 'Tools' },
  { any: ['profile', 'my profile', 'प्रोफाइल'], intent: 'navigate', args: { destination: 'you' }, reply: 'Profile' },
  { any: ['notifications', 'alerts', 'सूचना'], intent: 'navigate', args: { destination: 'notifications' }, reply: 'Notifications' },
  { any: ['settings', 'सेटिंग'], intent: 'navigate', args: { destination: 'settings' }, reply: 'Settings' },
  { any: ['bookmarks', 'saved', 'सेव'], intent: 'navigate', args: { destination: 'bookmarks' }, reply: 'Bookmarks' },

  // ── mini-apps ─────────────────────────────────────────────────────────────
  { any: ['notes', 'note', 'नोट'], intent: 'open_mini_app', args: { app: 'notes' }, reply: 'Notes' },
  { any: ['tasks', 'todo', 'काम'], intent: 'open_mini_app', args: { app: 'tasks' }, reply: 'Tasks' },
  { any: ['habits', 'आदत'], intent: 'open_mini_app', args: { app: 'habits' }, reply: 'Habits' },
  { any: ['pomodoro', 'focus', 'timer'], intent: 'open_mini_app', args: { app: 'pomodoro' }, reply: 'Pomodoro' },
  { any: ['money', 'expenses', 'खर्च', 'पैसा'], intent: 'open_mini_app', args: { app: 'expenses' }, reply: 'Money' },
  { any: ['fitness', 'workout'], intent: 'open_mini_app', args: { app: 'fitness' }, reply: 'Fitness' },

  // ── feed scope ────────────────────────────────────────────────────────────
  { any: ['for you', 'foryou'], intent: 'set_feed', args: { scope: 'forYou' }, reply: 'For you' },
  { any: ['trending'], intent: 'set_feed', args: { scope: 'trending' }, reply: 'Trending' },
  { any: ['following'], intent: 'set_feed', args: { scope: 'following' }, reply: 'Following' },
  { any: ['latest', 'newest'], intent: 'set_feed', args: { scope: 'latest' }, reply: 'Latest' },

  // ── appearance ────────────────────────────────────────────────────────────
  { any: ['dark mode', 'dark', 'डार्क'], intent: 'set_theme', args: { theme: 'dark' }, reply: 'Dark' },
  { any: ['light mode', 'light', 'लाइट'], intent: 'set_theme', args: { theme: 'light' }, reply: 'Light' },

  // ── in-place actions ──────────────────────────────────────────────────────
  { any: ['refresh', 'reload', 'रीफ्रेश'], intent: 'refresh', reply: 'Refreshed' },
  { any: ['back', 'go back', 'वापस', 'पीछे'], intent: 'go_back', reply: 'Back' },
  { any: ['scroll down', 'down', 'नीचे'], intent: 'scroll', args: { direction: 'down' }, reply: 'Scrolling' },
  { any: ['scroll up', 'up', 'ऊपर'], intent: 'scroll', args: { direction: 'up' }, reply: 'Scrolling' },
  { any: ['daily question', 'daily spark', 'question of the day'], intent: 'open_daily_question', reply: 'Daily question' },
  { any: ['new post', 'create post', 'compose', 'post karo'], intent: 'create_post', reply: 'New echo' },
  { any: ['read notifications', 'read my notifications'], intent: 'read_notifications', reply: 'Reading notifications' },
  { any: ['help', 'what can you do', 'मदद'], intent: 'help', reply: 'Help' },
];

/** Strip punctuation and collapse whitespace, preserving Devanagari. */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-phrase containment. "downtown" must not match "down", and "homework"
 * must not match "home" — substring matching is exactly how a fast path starts
 * doing the wrong thing confidently.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${haystack} `;
  return h.includes(` ${phrase} `);
}

export function matchLocalIntent(transcript: string, locale = ''): VoiceResult | null {
  const text = normalise(transcript);
  if (!text) return null;
  if (text.split(' ').length > MAX_WORDS) return null;

  // Longest phrase first, so "scroll down" wins over "down" and "dark mode"
  // over "dark". Ordering the rule list by hand would rot the moment someone
  // adds a rule in the wrong place.
  let best: { rule: Rule; length: number } | null = null;
  for (const rule of RULES) {
    for (const phrase of rule.any) {
      if (!containsPhrase(text, phrase)) continue;
      const length = phrase.length;
      if (!best || length > best.length) best = { rule, length };
    }
  }
  if (!best) return null;

  return {
    transcript,
    locale,
    intent: best.rule.intent,
    args: best.rule.args ?? {},
    reply: best.rule.reply,
  };
}
