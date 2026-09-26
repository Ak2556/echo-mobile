import type { VoiceResult } from './types';
import { DESTINATIONS } from './destinations';

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
 * Words that carry no intent of their own, so an utterance that is a command
 * wrapped in them is still that command: "open my notes" is "notes".
 *
 * Nothing here may also be a rule phrase, or stripping it would destroy the
 * very command being matched. "up", "down", "back", "search" and "light" are
 * all rule phrases and all deliberately absent.
 */
const FILLER = new Set([
  'please', 'open', 'go', 'to', 'the', 'my', 'show', 'me',
  'take', 'switch', 'now', 'just', 'into', 'start', 'launch',
  // Hindi wrappers. Without these "नोट खोलो" stopped resolving the moment
  // matching became equality, which would have quietly made the fast path
  // English-only in a product whose flagship language is Hindi.
  // 'karo' is deliberately absent: 'post karo' is itself a rule phrase.
  'खोलो', 'खोल', 'दिखाओ', 'दिखा', 'जाओ', 'चलो', 'मुझे',
]);

/**
 * Whether the whole utterance IS this command.
 *
 * This used to be containment on word boundaries, which reads as conservative
 * and is not: many rule phrases are ordinary English words, so any short
 * sentence carrying one fired an action. "my mind feels light today" switched
 * the theme to light, "i feel so down today" scrolled, "my back hurts" went
 * back. A word-boundary check buys nothing when the word is "light".
 *
 * So the test is equality, after filler is removed. A command survives the
 * wrappers people put round it; a sentence that merely mentions the word does
 * not. That honours the bias stated at the top of this file — a miss is cheap
 * because the model still handles it, and a wrong match is not.
 */
function isPhrase(text: string, phrase: string): boolean {
  if (text === phrase) return true;
  const stripped = text.split(' ').filter(w => !FILLER.has(w)).join(' ');
  return stripped === phrase;
}


/**
 * Dictation, matched by an explicit imperative prefix.
 *
 * This runs BEFORE the MAX_WORDS gate, which everything else obeys. That gate
 * exists because a long utterance is usually a sentence rather than a command,
 * and dictation is the one case where the opposite holds — "reply I will be
 * there in ten minutes" is long precisely because it is a command carrying its
 * payload.
 *
 * What makes that safe is not the length but the prefix: an explicit imperative
 * plus a non-empty remainder, never a bare word. And the intent is
 * context-gated anyway — with no composer on screen the dispatcher finds no
 * handler and reports not-handled, so a false match fills nothing.
 *
 * The remainder is taken from the RAW transcript, not the normalised text.
 * normalise() strips punctuation, which is right for matching a command and
 * wrong for the words a person is about to send to someone.
 */
const DICTATION_PREFIXES = [
  'type', 'write', 'reply', 'dictate',
  'लिखो', 'लिख', 'टाइप करो', 'जवाब दो', 'उत्तर दो',
  'likho', 'jawab do',
];

export function matchDictation(transcript: string): { text: string } | null {
  const raw = transcript.trim();
  const lower = raw.toLowerCase();
  for (const prefix of DICTATION_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const rest = raw.slice(prefix.length);
    // A separator is required, so "writer" is not "write" + "r".
    if (rest && !/^[\s:,-]/.test(rest)) continue;
    const text = rest.replace(/^[\s:,-]+/, '').trim();
    if (text) return { text };
  }
  return null;
}

export function matchLocalIntent(transcript: string, locale = ''): VoiceResult | null {
  // Before the length gate: see matchDictation.
  const dictated = matchDictation(transcript);
  if (dictated) {
    return { transcript, locale, intent: 'dictate', args: { text: dictated.text }, reply: 'Ready to send' };
  }

  const text = normalise(transcript);
  if (!text) return null;
  if (text.split(' ').length > MAX_WORDS) return null;

  // Longest phrase first, so "scroll down" wins over "down" and "dark mode"
  // over "dark". Ordering the rule list by hand would rot the moment someone
  // adds a rule in the wrong place.
  let best: { rule: Rule; length: number } | null = null;
  for (const rule of RULES) {
    for (const phrase of rule.any) {
      if (!isPhrase(text, phrase)) continue;
      const length = phrase.length;
      if (!best || length > best.length) best = { rule, length };
    }
  }
  if (best) {
    return {
      transcript,
      locale,
      intent: best.rule.intent,
      args: best.rule.args ?? {},
      reply: best.rule.reply,
    };
  }

  // Every remaining destination, on the same terms.
  //
  // The rules above are hand-written for the commands people repeat, but the
  // app has far more screens than rules, and each one that misses here costs a
  // network round trip and a model call to reach a table the device already
  // holds. Navigation is the one intent that never needs a model: the mapping
  // is finite, local and exact.
  //
  // Matched by equality after filler, exactly like isPhrase — not containment.
  // The table carries ordinary words like "report" and "share", and containment
  // would hand them every sentence that happens to use one.
  const stripped = text.split(' ').filter(w => !FILLER.has(w)).join(' ');
  const key = DESTINATIONS[text] ? text : DESTINATIONS[stripped] ? stripped : null;
  if (key) {
    return {
      transcript,
      locale,
      intent: 'navigate',
      args: { destination: key },
      reply: routeLabel(DESTINATIONS[key]),
    };
  }

  return null;
}

/** "/notification-prefs" -> "Notification prefs". Spoken back as confirmation. */
function routeLabel(route: string): string {
  const slug = route.replace(/^.*\//, '').replace(/[()]/g, '');
  const words = slug.replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Done';
}
