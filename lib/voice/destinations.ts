/**
 * Where a spoken destination resolves to, and the matching that gets it there.
 *
 * Split out of dispatch.ts so lib/voice/localIntent.ts can use it. localIntent
 * runs on every utterance before anything touches the network and imports only
 * a type; pulling in dispatch.ts would drag expo-router and the app store onto
 * that path. This module imports nothing.
 */


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

export function fuzzyLatinKey(query: string, keys: string[]): string | null {
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

export function matchDestination(spoken: string): string | null {
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
