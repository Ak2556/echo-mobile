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
import { DESTINATIONS, matchDestination, fuzzyLatinKey } from './destinations';

/** Re-exported so existing callers and tests keep their import path. */
export { DESTINATIONS };

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

// ---- Fuzzy word matching: tolerate ASR slips / accents ("setings"→settings,
// "pomodro"→pomodoro). Conservative — only Latin words ≥5 chars, edit distance
// ≤1 (≤2 for ≥8 chars) — so short words still require an exact match, avoiding
// false positives.


// The dictionary key a transcript token fuzzily matches (single Latin words only).

// Exact match first, then "contains" so phrases like "home par jao" or a Hindi
// word inside a sentence still resolve, then a fuzzy pass for ASR slips.
// Longest first, so "marketplace" beats "market" and "messages" beats "me"
// instead of whichever key happened to be declared earlier.

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
