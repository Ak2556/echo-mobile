import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the side-effecting deps so we can unit-test pure intent→action mapping.
// vi.hoisted lets the (hoisted) vi.mock factories reference these spies.
const h = vi.hoisted(() => ({
  push: vi.fn(), back: vi.fn(),
  setTheme: vi.fn(), setDarkMode: vi.fn(), setFeedScope: vi.fn(), setAppLanguage: vi.fn(),
  setNotificationsEnabled: vi.fn(), setHapticEnabled: vi.fn(), setPrivateAccount: vi.fn(),
}));
const { push, setTheme, setDarkMode, setFeedScope, setAppLanguage,
  setNotificationsEnabled, setHapticEnabled, setPrivateAccount } = h;

vi.mock('expo-router', () => ({ router: { push: h.push, back: h.back, canGoBack: () => true } }));
vi.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      setTheme: h.setTheme, setDarkMode: h.setDarkMode, setFeedScope: h.setFeedScope, setAppLanguage: h.setAppLanguage,
      setNotificationsEnabled: h.setNotificationsEnabled, setHapticEnabled: h.setHapticEnabled, setPrivateAccount: h.setPrivateAccount,
      // current values (for toggles voiced without an explicit on/off)
      notificationsEnabled: true, hapticEnabled: false, privateAccount: false,
    }),
  },
}));
// tts pulls React Native; stub it so importing the dispatcher stays pure.
vi.mock('../tts', () => ({ speakSequence: vi.fn(), speak: vi.fn(), stopSpeaking: vi.fn() }));

import { dispatchVoiceIntent } from './dispatch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const res = (intent: string, args: Record<string, unknown> = {}) =>
  ({ transcript: '', locale: 'hi', intent, args, reply: 'ok' } as any);

beforeEach(() => vi.clearAllMocks());

describe('voice dispatch — navigate (English · Devanagari · Romanized)', () => {
  const cases: Array<[string, string]> = [
    ['home', '/(tabs)/home'], ['होम', '/(tabs)/home'], ['ghar', '/(tabs)/home'],
    ['messages', '/messages'], ['मैसेज', '/messages'], ['sandesh', '/messages'],
    ['settings', '/settings'], ['सेटिंग', '/settings'], ['सेटिंग्स', '/settings'],
    ['profile', '/(tabs)/you'], ['प्रोफ़ाइल', '/(tabs)/you'], ['खाता', '/(tabs)/you'],
    ['market', '/(tabs)/marketplace'], ['बाज़ार', '/(tabs)/marketplace'], ['dukan', '/(tabs)/marketplace'],
    ['notifications', '/(tabs)/notifications'], ['सूचनाएं', '/(tabs)/notifications'],
    ['bookmarks', '/bookmarks'], ['बुकमार्क', '/bookmarks'],
    ['tools', '/(tabs)/apps'], ['टूल्स', '/(tabs)/apps'],
  ];
  it.each(cases)('%s → %s', (dest, route) => {
    const o = dispatchVoiceIntent(res('navigate', { destination: dest }));
    expect(o.handled).toBe(true);
    expect(o.navigatedTo).toBe(route);
  });
  it('handles a full Hindi sentence with the word inside', () => {
    const o = dispatchVoiceIntent(res('navigate', { destination: 'मुझे होम पर ले चलो' }));
    expect(o.navigatedTo).toBe('/(tabs)/home');
  });
  it('returns not-handled for an unknown destination', () => {
    expect(dispatchVoiceIntent(res('navigate', { destination: 'xyzzy' })).handled).toBe(false);
  });
});

describe('voice dispatch — open_mini_app (all 16, Hindi)', () => {
  const cases: Array<[string, string]> = [
    ['pomodoro', '/mini-apps/pomodoro'], ['टाइमर', '/mini-apps/pomodoro'], ['samay', '/mini-apps/pomodoro'],
    ['tasks', '/mini-apps/tasks'], ['टास्क', '/mini-apps/tasks'], ['काम', '/mini-apps/tasks'],
    ['notes', '/mini-apps/notes'], ['नोट', '/mini-apps/notes'],
    ['habits', '/mini-apps/habits'], ['आदत', '/mini-apps/habits'],
    ['expenses', '/mini-apps/expenses'], ['खर्च', '/mini-apps/expenses'], ['पैसा', '/mini-apps/expenses'],
    ['fitness', '/mini-apps/fitness'], ['कसरत', '/mini-apps/fitness'], ['व्यायाम', '/mini-apps/fitness'],
    ['learn', '/mini-apps/learn'], ['पढ़ाई', '/mini-apps/learn'], ['सीखो', '/mini-apps/learn'],
    ['planner', '/mini-apps/planner'], ['योजना', '/mini-apps/planner'],
    ['world-clock', '/mini-apps/world-clock'], ['घड़ी', '/mini-apps/world-clock'], ['समय क्षेत्र', '/mini-apps/world-clock'],
    ['calculator', '/mini-apps/calculator'], ['हिसाब', '/mini-apps/calculator'],
    ['shopping-list', '/mini-apps/shopping-list'], ['खरीदारी', '/mini-apps/shopping-list'],
    ['voice-memo', '/mini-apps/voice-memo'], ['रिकॉर्ड', '/mini-apps/voice-memo'],
    ['camera', '/mini-apps/camera'], ['कैमरा', '/mini-apps/camera'],
    ['password-gen', '/mini-apps/password-gen'], ['पासवर्ड', '/mini-apps/password-gen'],
  ];
  it.each(cases)('%s → %s', (app, route) => {
    const o = dispatchVoiceIntent(res('open_mini_app', { app }));
    expect(o.handled).toBe(true);
    expect(o.navigatedTo).toBe(route);
  });
  it('passes an in-app action + free-text value through as params (Hindi)', () => {
    dispatchVoiceIntent(res('open_mini_app', { app: 'tasks', action: 'add', value: 'दूध लाना' }));
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/mini-apps/tasks', params: { vAction: 'add', vValue: 'दूध लाना' } }),
    );
  });
});

describe('voice dispatch — set_theme actually flips dark mode (Hindi)', () => {
  it('light / लाइट → light mode', () => {
    for (const t of ['light', 'लाइट', 'उजाला', 'safed']) {
      vi.clearAllMocks();
      const o = dispatchVoiceIntent(res('set_theme', { theme: t }));
      expect(o.handled).toBe(true);
      expect(setDarkMode).toHaveBeenCalledWith(false);
      expect(setTheme).toHaveBeenCalledWith('light');
    }
  });
  it('dark / डार्क → dark mode', () => {
    for (const t of ['dark', 'डार्क', 'काला', 'raat']) {
      vi.clearAllMocks();
      const o = dispatchVoiceIntent(res('set_theme', { theme: t }));
      expect(o.handled).toBe(true);
      expect(setDarkMode).toHaveBeenCalledWith(true);
      expect(setTheme).toHaveBeenCalledWith('midnight');
    }
  });
});

describe('voice dispatch — set_feed (Hindi)', () => {
  const cases: Array<[string, string]> = [
    ['for you', 'semantic'], ['आपके लिए', 'semantic'],
    ['trending', 'forYou'], ['ट्रेंडिंग', 'forYou'],
    ['following', 'following'], ['फॉलोइंग', 'following'],
    ['latest', 'latest'], ['हालिया', 'latest'], ['naya', 'latest'],
  ];
  it.each(cases)('%s → scope %s', (scope, expected) => {
    const o = dispatchVoiceIntent(res('set_feed', { scope }));
    expect(o.handled).toBe(true);
    expect(setFeedScope).toHaveBeenCalledWith(expected);
  });
});

describe('voice dispatch — toggle_setting (Hindi + on/off)', () => {
  it('नोटिफिकेशन बंद → setNotificationsEnabled(false)', () => {
    dispatchVoiceIntent(res('toggle_setting', { setting: 'नोटिफिकेशन', value: 'बंद' }));
    expect(setNotificationsEnabled).toHaveBeenCalledWith(false);
  });
  it('हैप्टिक चालू → setHapticEnabled(true)', () => {
    dispatchVoiceIntent(res('toggle_setting', { setting: 'हैप्टिक', value: 'चालू' }));
    expect(setHapticEnabled).toHaveBeenCalledWith(true);
  });
  it('प्राइवेट अकाउंट (no value) → toggles from current false to true', () => {
    dispatchVoiceIntent(res('toggle_setting', { setting: 'प्राइवेट अकाउंट' }));
    expect(setPrivateAccount).toHaveBeenCalledWith(true);
  });
  it('unknown setting → not handled', () => {
    expect(dispatchVoiceIntent(res('toggle_setting', { setting: 'nonsense' })).handled).toBe(false);
  });
});

describe('voice dispatch — theme phrased as a toggle ("लाइट मोड ऑन करो")', () => {
  it('light mode on (toggle_setting) → real light-mode change, not a no-op', () => {
    for (const s of ['light mode', 'लाइट मोड', 'लाइट']) {
      vi.clearAllMocks();
      const o = dispatchVoiceIntent(res('toggle_setting', { setting: s, value: 'on' }));
      expect(o.handled).toBe(true);
      expect(setDarkMode).toHaveBeenCalledWith(false);
      expect(setTheme).toHaveBeenCalledWith('light');
    }
  });
  it('dark mode on (toggle_setting) → real dark-mode change', () => {
    vi.clearAllMocks();
    const o = dispatchVoiceIntent(res('toggle_setting', { setting: 'डार्क मोड', value: 'on' }));
    expect(o.handled).toBe(true);
    expect(setDarkMode).toHaveBeenCalledWith(true);
    expect(setTheme).toHaveBeenCalledWith('midnight');
  });
});

describe('voice dispatch — transcript fallback (forgiving of odd phrasing)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const full = (intent: string, args: Record<string, unknown>, transcript: string) =>
    ({ transcript, locale: 'hi', intent, args, reply: 'ok' } as any);

  it('navigate: empty arg → resolves destination from the transcript', () => {
    expect(dispatchVoiceIntent(full('navigate', {}, 'ले चलो मुझे सेटिंग्स में')).navigatedTo).toBe('/settings');
    expect(dispatchVoiceIntent(full('navigate', {}, 'take me to my messages please')).navigatedTo).toBe('/messages');
  });
  it('open_mini_app: wrong arg → resolves the app from the transcript', () => {
    expect(dispatchVoiceIntent(full('open_mini_app', { app: 'zzz' }, 'पोमोडोरो टाइमर चालू करो')).navigatedTo).toBe('/mini-apps/pomodoro');
  });
  it('set_theme: theme word only in the transcript', () => {
    vi.clearAllMocks();
    dispatchVoiceIntent(full('set_theme', {}, 'लाइट मोड'));
    expect(setDarkMode).toHaveBeenCalledWith(false);
    expect(setTheme).toHaveBeenCalledWith('light');
  });
  it('set_feed: scope only in the transcript', () => {
    dispatchVoiceIntent(full('set_feed', {}, 'ट्रेंडिंग वाला दिखाओ'));
    expect(setFeedScope).toHaveBeenCalledWith('forYou');
  });
  it('toggle_setting: setting + on/off from the transcript', () => {
    dispatchVoiceIntent(full('toggle_setting', {}, 'नोटिफिकेशन बंद कर दो'));
    expect(setNotificationsEnabled).toHaveBeenCalledWith(false);
  });
});

describe('voice dispatch — set_language (Hindi)', () => {
  it.each([['हिंदी', 'hi'], ['hindi', 'hi'], ['english', 'en'], ['अंग्रेजी', 'en']])(
    '%s → %s', (lang, code) => {
      const o = dispatchVoiceIntent(res('set_language', { language: lang }));
      expect(o.handled).toBe(true);
      expect(setAppLanguage).toHaveBeenCalledWith(code);
    },
  );
});
