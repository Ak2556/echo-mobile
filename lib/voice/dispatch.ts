// Turns a parsed voice intent into an actual app action: navigation via the
// expo-router imperative API, or a store mutation (e.g. switching language).
// Pure module — safe to call from the voice controller. Never throws; returns a
// DispatchOutcome describing what happened and what to show/speak back.

import { router } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { APP_LANGUAGES, normalizeAppLanguage, type AppLanguageCode } from '../languages';
import { MINI_APP_CATALOG } from '../miniAppCatalog';
import { readFeedAloud } from './readFeed';
import { readNotificationsAloud } from './readNotifications';
import { getVoiceActions, type PostAction } from './actions';
import type { VoiceResult } from './types';

// Spoken setting name → its boolean store setter. Covers the toggles users are
// most likely to voice; the value is parsed on/off (or toggled if unspecified).
const SETTINGS_MAP: Record<string, string> = {
  notifications: 'setNotificationsEnabled', push: 'setNotificationsEnabled',
  haptics: 'setHapticEnabled', vibration: 'setHapticEnabled',
  sound: 'setSoundEnabled', sounds: 'setSoundEnabled', 'sound effects': 'setSoundEnabled',
  'read receipts': 'setReadReceipts', 'online status': 'setOnlineStatus', 'activity status': 'setActivityStatus',
  'compact feed': 'setCompactFeed', compact: 'setCompactFeed',
  'data saver': 'setDataSaver', 'private account': 'setPrivateAccount', private: 'setPrivateAccount',
  'reduce animations': 'setReduceAnimations', animations: 'setReduceAnimations',
  'autoplay stories': 'setAutoplayStories', avatars: 'setShowAvatars', 'preview cards': 'setShowPreviewCards',
  'pure black': 'setPureBlackBackground', 'auto save chats': 'setAutoSaveChats',
  'stream responses': 'setStreamResponses', 'typing indicator': 'setShowTypingIndicator',
  'proactive ai': 'setProactiveAiEnabled',
  'auto read replies': 'setAutoReadAiReplies', 'auto read ai': 'setAutoReadAiReplies',
  'auto read messages': 'setAutoReadMessages', 'read aloud messages': 'setAutoReadMessages',
  // Hindi setting names
  'नोटिफिकेशन': 'setNotificationsEnabled', 'सूचना': 'setNotificationsEnabled',
  'साउंड': 'setSoundEnabled', 'आवाज़': 'setSoundEnabled', 'आवाज': 'setSoundEnabled', 'ध्वनि': 'setSoundEnabled',
  'हैप्टिक': 'setHapticEnabled', 'वाइब्रेशन': 'setHapticEnabled', 'कंपन': 'setHapticEnabled',
  'प्राइवेट': 'setPrivateAccount', 'निजी': 'setPrivateAccount', 'प्राइवेट अकाउंट': 'setPrivateAccount',
  'रीड रिसीट': 'setReadReceipts', 'डेटा सेवर': 'setDataSaver', 'कॉम्पैक्ट': 'setCompactFeed',
  'एनिमेशन': 'setReduceAnimations', 'एनीमेशन': 'setReduceAnimations', 'ऑटोप्ले': 'setAutoplayStories',
  'अवतार': 'setShowAvatars', 'ऑनलाइन': 'setOnlineStatus', 'ऑनलाइन स्टेटस': 'setOnlineStatus',
  'टाइपिंग': 'setShowTypingIndicator', 'प्योर ब्लैक': 'setPureBlackBackground', 'काली स्क्रीन': 'setPureBlackBackground',
  'ऑटो रीड': 'setAutoReadAiReplies', 'संदेश पढ़ो': 'setAutoReadMessages',
  // Punjabi setting names
  'ਨੋਟੀਫਿਕੇਸ਼ਨ': 'setNotificationsEnabled', 'ਸੂਚਨਾ': 'setNotificationsEnabled',
  'ਸਾਊਂਡ': 'setSoundEnabled', 'ਆਵਾਜ਼': 'setSoundEnabled',
  'ਵਾਈਬ੍ਰੇਸ਼ਨ': 'setHapticEnabled', 'ਕੰਬਣੀ': 'setHapticEnabled',
  'ਪ੍ਰਾਈਵੇਟ': 'setPrivateAccount', 'ਨਿੱਜੀ': 'setPrivateAccount',
  'ਡਾਟਾ ਸੇਵਰ': 'setDataSaver', 'ਐਨੀਮੇਸ਼ਨ': 'setReduceAnimations',
  'ਆਨਲਾਈਨ': 'setOnlineStatus', 'ਟਾਈਪਿੰਗ': 'setShowTypingIndicator',
};

// on / enable / true / yes → true; off / disable / false / no → false; else null (toggle).
function parseOnOff(spoken: string): boolean | null {
  const q = spoken.trim().toLowerCase();
  if (/\b(on|enable|enabled|true|yes|start|turn on|chalu|chaalu|chaloo|shuru|haan|haa)\b|चालू|ऑन|शुरू|खोलो|चाहिए|हाँ|हां|ऑन कर/.test(q)) return true;
  if (/\b(off|disable|disabled|false|no|stop|turn off|band|bandh|nahi|nahin|mat karo|hatao)\b|बंद|ऑफ|रोको|मत|नहीं|नही|हटाओ|ऑफ कर/.test(q)) return false;
  return null;
}

function matchSetting(spoken: string): string | null {
  const q = spoken.trim().toLowerCase();
  if (SETTINGS_MAP[q]) return SETTINGS_MAP[q];
  for (const key of Object.keys(SETTINGS_MAP)) if (q.includes(key)) return SETTINGS_MAP[key];
  return null;
}

type FeedScope = 'semantic' | 'forYou' | 'following' | 'latest';

// Spoken destination → route. Accepts a wide range of synonyms the model emits.
export const DESTINATIONS: Record<string, string> = {
  home: '/(tabs)/home', feed: '/(tabs)/home', timeline: '/(tabs)/home',
  explore: '/(tabs)/explore', discover: '/(tabs)/explore', search: '/(tabs)/explore',
  market: '/mini-apps/marketplace', marketplace: '/mini-apps/marketplace', shop: '/mini-apps/marketplace', store: '/mini-apps/marketplace',
  chat: '/(tabs)/chat', ai: '/(tabs)/chat', assistant: '/(tabs)/chat',
  messages: '/messages', dms: '/messages', inbox: '/messages',
  you: '/(tabs)/you', profile: '/(tabs)/you', me: '/(tabs)/you', account: '/(tabs)/you',
  alerts: '/(tabs)/notifications', notifications: '/(tabs)/notifications', activity: '/(tabs)/notifications',
  settings: '/settings', preferences: '/settings', options: '/settings',
  create: '/create-post', post: '/create-post', compose: '/create-post', write: '/create-post',
  story: '/create-story',
  bookmarks: '/bookmarks', saved: '/bookmarks',
  followers: '/followers', following: '/followers',
  tools: '/(tabs)/apps', apps: '/(tabs)/apps',
  // The Flow tab. lib/voice/localIntent.ts already emits destination 'watch'
  // for "video"/"flow", and without these keys that fast path dead-ended.
  watch: '/(tabs)/watch', flow: '/(tabs)/watch', video: '/(tabs)/watch', videos: '/(tabs)/watch', reels: '/(tabs)/watch',
  verify: '/get-verified', verification: '/get-verified', verified: '/get-verified',
  badges: '/badges', quests: '/quests',
  salons: '/salons',
  // Every remaining screen a person can reach by tapping. Voice control is the
  // app's central promise, so a screen with no phrase is a hole in it — the test
  // below fails when one ships without an entry here.
  'edit profile': '/edit-profile', 'change profile': '/edit-profile', 'update profile': '/edit-profile',
  'edit post': '/edit-post',
  'notification settings': '/notification-prefs', 'notification preferences': '/notification-prefs',
  'blocked': '/blocked-users', 'blocked users': '/blocked-users', 'blocked people': '/blocked-users',
  'muted': '/muted-users', 'muted users': '/muted-users', 'muted people': '/muted-users',
  'my reports': '/my-reports', 'reports': '/my-reports',
  'report': '/report',
  'appeal': '/appeal',
  'moderation appeals': '/mod-appeals', 'mod appeals': '/mod-appeals',
  'moderation verifications': '/mod-verifications', 'mod verifications': '/mod-verifications',
  'sell': '/create-listing', 'create listing': '/create-listing', 'new listing': '/create-listing', 'list an item': '/create-listing',
  'create salon': '/create-salon', 'new salon': '/create-salon',
  'office hours': '/office-hours', 'office hour': '/office-hours',
  'create office hour': '/create-office-hour', 'new office hour': '/create-office-hour',
  'thinking partners': '/thinking-partners', 'partners': '/thinking-partners',
  'persona': '/persona',
  'ai memory': '/ai-memory', 'memories': '/ai-memory',
  'target': '/target-progress', 'progress': '/target-progress', 'goal': '/target-progress', 'my goal': '/target-progress',
  'year in echo': '/year-in-echo', 'my year': '/year-in-echo', 'recap': '/year-in-echo',
  'stories': '/story', 'my stories': '/story',
  'share': '/share',
  'delete account': '/delete-account', 'close account': '/delete-account',
  'welcome': '/welcome', 'onboarding': '/onboarding',
  'privacy': '/privacy', 'privacy policy': '/privacy',
  'terms': '/terms', 'terms of service': '/terms',
  'rules': '/legal/rules', 'community rules': '/legal/rules',
  'child safety': '/legal/child-safety',
  'eu representative': '/legal/eu-rep',
  // Hindi for the ones people will actually ask for by voice.
  'प्रोफाइल एडिट': '/edit-profile', 'प्रोफ़ाइल बदलो': '/edit-profile',
  'बेचें': '/create-listing', 'बेचो': '/create-listing', 'लिस्टिंग': '/create-listing',
  'ब्लॉक': '/blocked-users', 'म्यूट': '/muted-users',
  'रिपोर्ट': '/report', 'मेरी रिपोर्ट': '/my-reports',
  'नियम': '/legal/rules', 'गोपनीयता': '/privacy', 'शर्तें': '/terms',
  'लक्ष्य': '/target-progress', 'सैलून बनाओ': '/create-salon',
  // Singular / common variants so "notification", "message", "setting" resolve too.
  notification: '/(tabs)/notifications', message: '/messages', dm: '/messages',
  setting: '/settings', bookmark: '/bookmarks', follower: '/followers',
  homepage: '/(tabs)/home', 'home page': '/(tabs)/home', 'my profile': '/(tabs)/you',
  // Hindi (Devanagari) fallbacks in case the model passes the word through.
  'होम': '/(tabs)/home', 'घर': '/(tabs)/home', 'फ़ीड': '/(tabs)/home', 'फीड': '/(tabs)/home',
  'खोज': '/(tabs)/explore', 'खोजें': '/(tabs)/explore', 'एक्सप्लोर': '/(tabs)/explore',
  'मार्केट': '/mini-apps/marketplace', 'बाज़ार': '/mini-apps/marketplace', 'बाजार': '/mini-apps/marketplace',
  'चैट': '/(tabs)/chat', 'मैसेज': '/messages', 'संदेश': '/messages', 'मैसेजेस': '/messages',
  'प्रोफाइल': '/(tabs)/you', 'प्रोफ़ाइल': '/(tabs)/you',
  'नोटिफिकेशन': '/(tabs)/notifications', 'सूचना': '/(tabs)/notifications', 'सूचनाएं': '/(tabs)/notifications', 'अलर्ट': '/(tabs)/notifications',
  'सेटिंग': '/settings', 'सेटिंग्स': '/settings',
  'बुकमार्क': '/bookmarks', 'सेव': '/bookmarks',
  'फॉलोअर': '/followers', 'फॉलोअर्स': '/followers',
  'टूल': '/(tabs)/apps', 'टूल्स': '/(tabs)/apps', 'औजार': '/(tabs)/apps',
  'वीडियो': '/(tabs)/watch', 'वीडियोज़': '/(tabs)/watch',
  'ਵੀਡੀਓ': '/(tabs)/watch',
  'स्टोरी': '/create-story', 'बैज': '/badges', 'क्वेस्ट': '/quests',
  'बातचीत': '/(tabs)/chat', 'दुकान': '/mini-apps/marketplace', 'खाता': '/(tabs)/you', 'अकाउंट': '/(tabs)/you',
  // Romanized Hindi
  ghar: '/(tabs)/home', khoj: '/(tabs)/explore', sandesh: '/messages', dukan: '/mini-apps/marketplace',
  suchna: '/(tabs)/notifications', khata: '/(tabs)/you',
  // Punjabi (Gurmukhi)
  'ਹੋਮ': '/(tabs)/home', 'ਘਰ': '/(tabs)/home', 'ਫੀਡ': '/(tabs)/home',
  'ਖੋਜ': '/(tabs)/explore', 'ਐਕਸਪਲੋਰ': '/(tabs)/explore',
  'ਮਾਰਕੀਟ': '/mini-apps/marketplace', 'ਬਾਜ਼ਾਰ': '/mini-apps/marketplace',
  'ਚੈਟ': '/(tabs)/chat', 'ਮੈਸੇਜ': '/messages', 'ਸੁਨੇਹਾ': '/messages',
  'ਪ੍ਰੋਫਾਈਲ': '/(tabs)/you', 'ਖਾਤਾ': '/(tabs)/you',
  'ਨੋਟੀਫਿਕੇਸ਼ਨ': '/(tabs)/notifications', 'ਸੈਟਿੰਗ': '/settings',
  'ਟੂਲ': '/(tabs)/apps', 'ਔਜ਼ਾਰ': '/(tabs)/apps', 'ਗੱਲਬਾਤ': '/(tabs)/chat',
};

// ---- Fuzzy word matching: tolerate ASR slips / accents ("setings"→settings,
// "pomodro"→pomodoro). Conservative — only Latin words ≥5 chars, edit distance
// ≤1 (≤2 for ≥8 chars) — so short words still require an exact match, avoiding
// false positives.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

function wordTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean);
}

// The dictionary key a transcript token fuzzily matches (single Latin words only).
function fuzzyLatinKey(query: string, keys: string[]): string | null {
  const toks = wordTokens(query).filter((t) => t.length >= 5 && /^[a-z]+$/.test(t));
  for (const t of toks) {
    for (const k of keys) {
      if (k.length < 5 || k.includes(' ') || !/^[a-z]+$/.test(k)) continue;
      const tol = Math.max(k.length, t.length) >= 8 ? 2 : 1;
      if (Math.abs(t.length - k.length) <= tol && editDistance(t, k) <= tol) return k;
    }
  }
  return null;
}

// Exact match first, then "contains" so phrases like "home par jao" or a Hindi
// word inside a sentence still resolve, then a fuzzy pass for ASR slips.
// Longest first, so "marketplace" beats "market" and "messages" beats "me"
// instead of whichever key happened to be declared earlier.
const DESTINATION_KEYS = Object.keys(DESTINATIONS).sort((a, b) => b.length - a.length);

const LATIN_KEY = /^[a-z0-9 ]+$/;

/**
 * Keys that only ever match on their own.
 *
 * A word boundary fixes "explain" -> "ai" and "postpone" -> "post", but it
 * cannot fix a key that IS an ordinary word: "can you explain this" contains
 * "you" as a genuine word, and matchDestination runs over the whole transcript
 * whenever the model's destination argument does not resolve. Saying "you"
 * should still open the profile, so these stay in the table and stay available
 * to the exact-match pass — they are just barred from being fished out of a
 * sentence.
 */
const EXACT_ONLY = new Set([
  'me', 'you', 'ai', 'post', 'create', 'write', 'search', 'activity', 'options', 'store', 'shop',
  // "tell me a story" is not a request to open the story composer.
  'story', 'message', 'chat', 'account',
]);

/**
 * Contains-match, but a Latin key has to land on a word boundary.
 *
 * Plain `includes` meant "explain" navigated to chat through "ai", "your" went
 * to the profile through "you", and "postpone" opened the composer through
 * "post". That matters more than it looks: matchDestination is also run over
 * the WHOLE transcript as a fallback when the model's destination argument does
 * not resolve, so every ordinary sentence was a candidate for an accidental
 * navigation. Devanagari and Gurmukhi keys keep substring matching, since those
 * scripts do not space-delimit the way the boundary class assumes.
 */
function containsKey(haystack: string, key: string): boolean {
  if (!LATIN_KEY.test(key)) return haystack.includes(key);
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${safe}(?:[^a-z0-9]|$)`).test(haystack);
}

function matchDestination(spoken: string): string | null {
  const q = spoken.trim().toLowerCase();
  if (!q) return null;
  if (DESTINATIONS[q]) return DESTINATIONS[q];
  for (const key of DESTINATION_KEYS) {
    if (EXACT_ONLY.has(key)) continue;
    if (containsKey(q, key)) return DESTINATIONS[key];
  }
  // Fuzzy is for an ASR slip on a destination word ("bookmarkz"), not for
  // fishing through a sentence: run over "tell me a story about ai" it returned
  // a match on edit distance alone, which is how an ordinary remark became a
  // navigation. Bound it to short input, and keep the ambiguous words out of it
  // for the same reason they are barred from the contains pass.
  if (q.split(/\s+/).length <= 3) {
    const fk = fuzzyLatinKey(q, DESTINATION_KEYS.filter(k => !EXACT_ONLY.has(k)));
    if (fk) return DESTINATIONS[fk];
  }
  return null;
}

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
    ['ਪੰਜਾਬੀ', 'pa'], ['punjabi', 'pa'],
  ];
  for (const [k, code] of HINTS) if (q.includes(k.toLowerCase())) return code;
  return null;
}

// Spoken tool name → mini-app route (exact, then contains, then synonyms).
function matchMiniApp(spoken: string): string | null {
  const q = spoken.trim().toLowerCase();
  if (!q) return null;
  for (const a of MINI_APP_CATALOG) {
    if (a.id.toLowerCase() === q || a.name.toLowerCase() === q) return a.route as string;
  }
  for (const a of MINI_APP_CATALOG) {
    if (q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q)) return a.route as string;
  }
  const SYN: Record<string, string> = {
    // English synonyms
    timer: 'pomodoro', focus: 'pomodoro', money: 'expenses', expense: 'expenses', budget: 'expenses',
    workout: 'fitness', gym: 'fitness', exercise: 'fitness', task: 'tasks', todo: 'tasks', note: 'notes',
    habit: 'habits', shopping: 'shopping-list', grocery: 'shopping-list', calculator: 'calculator', calc: 'calculator',
    study: 'learn', course: 'learn', planner: 'planner', schedule: 'planner',
    memo: 'voice-memo', 'voice memo': 'voice-memo', recording: 'voice-memo',
    photo: 'studio', camera: 'studio', 'image editor': 'editor', 'photo editor': 'editor',
    clock: 'world-clock', 'world clock': 'world-clock', timezone: 'world-clock',
    write: 'markdown', writing: 'markdown',
    // Utilities added to the catalog on 2026-09-03. Exact names already match
    // via MINI_APP_CATALOG; these are the words people actually say.
    split: 'bill-splitter', 'split the bill': 'bill-splitter', bill: 'bill-splitter', tip: 'bill-splitter',
    weight: 'bmi', bmi: 'bmi', 'body mass': 'bmi',
    convert: 'converter', conversion: 'converter', unit: 'converter', units: 'converter',
    colour: 'color-tools', color: 'color-tools', 'color picker': 'color-tools', palette: 'color-tools', hex: 'color-tools',
    json: 'json-formatter', 'format json': 'json-formatter',
    roll: 'dice', die: 'dice', 'roll a die': 'dice', random: 'dice',
    // Hindi
    'बिल': 'bill-splitter', 'बाँटो': 'bill-splitter',
    'वज़न': 'bmi', 'वजन': 'bmi',
    'बदलो': 'converter', 'रंग': 'color-tools', 'पासा': 'dice',
    // Hindi (Devanagari)
    'टाइमर': 'pomodoro', 'पोमोडोरो': 'pomodoro', 'टास्क': 'tasks', 'काम': 'tasks', 'नोट': 'notes', 'नोट्स': 'notes',
    'आदत': 'habits', 'आदतें': 'habits', 'पैसा': 'expenses', 'खर्च': 'expenses', 'बजट': 'expenses',
    'फिटनेस': 'fitness', 'कसरत': 'fitness', 'व्यायाम': 'fitness',
    'शॉपिंग': 'shopping-list', 'खरीदारी': 'shopping-list', 'सामान': 'shopping-list',
    'कैलकुलेटर': 'calculator', 'हिसाब': 'calculator', 'गणना': 'calculator',
    'सीखो': 'learn', 'सीखें': 'learn', 'पढ़ाई': 'learn', 'लर्न': 'learn', 'कोर्स': 'learn',
    'प्लानर': 'planner', 'योजना': 'planner',
    'वॉइस मेमो': 'voice-memo', 'आवाज़ नोट': 'voice-memo', 'रिकॉर्ड': 'voice-memo', 'रिकॉर्डिंग': 'voice-memo',
    'कैमरा': 'studio', 'फोटो': 'studio', 'तस्वीर': 'studio',
    'फोटो एडिटर': 'editor', 'इमेज एडिटर': 'editor',
    'घड़ी': 'world-clock', 'वर्ल्ड क्लॉक': 'world-clock', 'समय क्षेत्र': 'world-clock',
    'लिखो': 'markdown', 'लेखन': 'markdown',
    // Romanized Hindi
    samay: 'pomodoro', kaam: 'tasks', aadat: 'habits', paisa: 'expenses', kharch: 'expenses',
    kasrat: 'fitness', vyayam: 'fitness', hisab: 'calculator', ganna: 'calculator',
    padhai: 'learn', seekho: 'learn', yojana: 'planner', ghadi: 'world-clock',
    likho: 'markdown', kharidari: 'shopping-list', saman: 'shopping-list',
    // Punjabi
    'ਟਾਈਮਰ': 'pomodoro', 'ਕੰਮ': 'tasks', 'ਨੋਟਸ': 'notes', 'ਆਦਤ': 'habits',
    'ਪੈਸਾ': 'expenses', 'ਖਰਚਾ': 'expenses', 'ਕਸਰਤ': 'fitness', 'ਹਿਸਾਬ': 'calculator',
    'ਖਰੀਦਦਾਰੀ': 'shopping-list', 'ਪੜ੍ਹਾਈ': 'learn', 'ਯੋਜਨਾ': 'planner',
  };
  for (const [k, id] of Object.entries(SYN)) {
    if (q.includes(k)) { const a = MINI_APP_CATALOG.find((x) => x.id === id); if (a) return a.route as string; }
  }
  // Fuzzy fallback over single-word Latin aliases (catalog ids/names + SYN keys)
  // so "pomodro"/"calculater"/"fitnes" still resolve.
  const latin: Record<string, string> = {};
  for (const a of MINI_APP_CATALOG) {
    if (/^[a-z]+$/.test(a.id)) latin[a.id] = a.route as string;
    if (/^[a-z]+$/.test(a.name)) latin[a.name.toLowerCase()] = a.route as string;
  }
  for (const [k, id] of Object.entries(SYN)) {
    if (/^[a-z]+$/.test(k)) { const a = MINI_APP_CATALOG.find((x) => x.id === id); if (a) latin[k] = a.route as string; }
  }
  const fk = fuzzyLatinKey(q, Object.keys(latin));
  if (fk) return latin[fk];
  return null;
}

function matchFeedScope(spoken: string): FeedScope | null {
  const q = spoken.trim().toLowerCase();
  if (/for ?you|personal|आपके लिए|आपके लिये|aapke|apke|ਤੁਹਾਡੇ ਲਈ/.test(q)) return 'semantic';
  if (/trend|ट्रेंड|ट्रेंडिंग|ਟ੍ਰੈਂਡ/.test(q)) return 'forYou';
  if (/follow|फॉलो|फ़ॉलो|ਫਾਲੋ/.test(q)) return 'following';
  if (/latest|recent|new|नवीनतम|हालिया|नया|ताज़ा|naya|taza|ਤਾਜ਼ਾ/.test(q)) return 'latest';
  return null;
}

function matchTheme(spoken: string): 'light' | 'midnight' | null {
  const q = spoken.trim().toLowerCase();
  if (/dark|night|black|amoled|डार्क|काला|रात|अंधेरा|kaala|raat|ਡਾਰਕ|ਹਨੇਰਾ/.test(q)) return 'midnight';
  if (/light|day|white|bright|लाइट|उजाला|सफेद|रोशनी|ujala|safed|ਲਾਈਟ|ਚਾਨਣ/.test(q)) return 'light';
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
  // Users phrase things every which way and the model doesn't always drop the
  // right word into the right arg. So for every matchable slot we try the
  // structured arg first, then fall back to scanning the raw transcript — this
  // makes recognition far more forgiving of how each person actually speaks.
  const transcript = typeof result.transcript === 'string' ? result.transcript : '';

  switch (intent) {
    case 'navigate': {
      const route = matchDestination(str(args.destination)) || matchDestination(transcript);
      if (!route) return { handled: false, reply };
      router.push(route as never);
      return { handled: true, reply, navigatedTo: route };
    }

    case 'open_mini_app': {
      const route = matchMiniApp(str(args.app)) || matchMiniApp(transcript);
      if (!route) return { handled: false, reply };
      // An optional in-app action (start/stop a timer, add a task…) rides along as
      // route params the target mini-app reads and performs once.
      const vAction = str(args.action).toLowerCase();
      const vValue = str(args.value) || str(args.text);
      router.push({
        pathname: route,
        params: { ...(vAction ? { vAction } : {}), ...(vValue ? { vValue } : {}) },
      } as never);
      return { handled: true, reply, navigatedTo: route };
    }

    case 'set_feed': {
      const scope = matchFeedScope(str(args.scope)) || matchFeedScope(transcript);
      if (!scope) return { handled: false, reply };
      router.push('/(tabs)/home' as never);
      useAppStore.getState().setFeedScope(scope);
      return { handled: true, reply };
    }

    case 'set_theme': {
      const theme = matchTheme(str(args.theme)) || matchTheme(transcript);
      if (!theme) return { handled: false, reply };
      // darkMode is the master light/dark switch and overrides the palette, so
      // flip it too — otherwise setTheme('light') resolves back to dark.
      const store = useAppStore.getState();
      store.setDarkMode(theme !== 'light');
      store.setTheme(theme);
      return { handled: true, reply };
    }

    case 'read_notifications': {
      const count = readNotificationsAloud(reply);
      return { handled: count > 0, reply, spoken: true };
    }

    case 'toggle_setting': {
      // "light mode on / डार्क मोड ऑन करो" — the model often routes appearance to
      // toggle_setting because of the on/off phrasing. There's no boolean for it,
      // so treat any theme word here as a real theme change (the master darkMode
      // switch), not a no-op toggle.
      const asTheme = matchTheme(str(args.setting)) || matchTheme(transcript);
      if (asTheme) {
        const store = useAppStore.getState();
        store.setDarkMode(asTheme !== 'light');
        store.setTheme(asTheme);
        return { handled: true, reply };
      }
      const setter = matchSetting(str(args.setting)) || matchSetting(transcript);
      if (!setter) return { handled: false, reply };
      const state = useAppStore.getState() as unknown as Record<string, unknown>;
      const key = setter.charAt(3).toLowerCase() + setter.slice(4); // setFooBar → fooBar
      const desired = parseOnOff(str(args.value)) ?? parseOnOff(transcript);
      const value = desired ?? !(state[key] as boolean);
      const fn = state[setter];
      if (typeof fn !== 'function') return { handled: false, reply };
      (fn as (v: boolean) => void)(value);
      return { handled: true, reply };
    }

    case 'post_action': {
      const action = `${str(args.action)} ${transcript}`.toLowerCase();
      const norm: PostAction | null =
        /like|लाइक|पसंद|ਲਾਈਕ/.test(action) ? 'like'
        : /bookmark|save|सेव|बुकमार्क|ਸੇਵ/.test(action) ? 'bookmark'
        : /repost|re-?echo|share|रीपोस्ट|शेयर|ਸ਼ੇਅਰ/.test(action) ? 'repost'
        : /follow|फॉलो|ਫਾਲੋ/.test(action) ? 'follow'
        : /open|खोल|ਖੋਲ੍ਹੋ/.test(action) ? 'open'
        : null;
      if (!norm) return { handled: false, reply };
      const did = getVoiceActions().postAction?.(norm);
      return { handled: !!did, reply };
    }

    case 'scroll': {
      const dir = /up|top|back|previous|ऊपर|पीछे|वापस/.test(`${str(args.direction)} ${transcript}`.toLowerCase()) ? 'up' : 'down';
      getVoiceActions().scroll?.(dir);
      return { handled: true, reply };
    }

    case 'refresh': {
      getVoiceActions().refresh?.();
      return { handled: true, reply };
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
      const code = matchLanguage(str(args.language)) || matchLanguage(transcript);
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
