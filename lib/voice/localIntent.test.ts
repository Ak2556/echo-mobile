import { describe, expect, it } from 'vitest';
import { DESTINATIONS } from './destinations';
import { matchLocalIntent, normalise } from './localIntent';

describe('normalise', () => {
  it('strips punctuation and collapses whitespace', () => {
    expect(normalise('  Go   HOME, please! ')).toBe('go home please');
  });

  it('leaves Devanagari intact', () => {
    expect(normalise('होम खोलो')).toBe('होम खोलो');
  });
});

describe('matchLocalIntent — the commands people repeat', () => {
  it('routes navigation', () => {
    expect(matchLocalIntent('go home')).toMatchObject({
      intent: 'navigate',
      args: { destination: 'home' },
    });
    expect(matchLocalIntent('open explore')).toMatchObject({
      intent: 'navigate',
      args: { destination: 'explore' },
    });
    expect(matchLocalIntent('settings')).toMatchObject({
      intent: 'navigate',
      args: { destination: 'settings' },
    });
  });

  it('opens mini-apps', () => {
    expect(matchLocalIntent('open notes')).toMatchObject({
      intent: 'open_mini_app',
      args: { app: 'notes' },
    });
    expect(matchLocalIntent('start pomodoro')).toMatchObject({
      intent: 'open_mini_app',
      args: { app: 'pomodoro' },
    });
  });

  it('switches feed scope', () => {
    expect(matchLocalIntent('show trending')).toMatchObject({
      intent: 'set_feed',
      args: { scope: 'trending' },
    });
    expect(matchLocalIntent('for you')).toMatchObject({
      intent: 'set_feed',
      args: { scope: 'forYou' },
    });
  });

  it('handles Hindi, in Devanagari and romanised', () => {
    expect(matchLocalIntent('होम')).toMatchObject({ intent: 'navigate', args: { destination: 'home' } });
    expect(matchLocalIntent('नोट खोलो')).toMatchObject({ intent: 'open_mini_app', args: { app: 'notes' } });
    expect(matchLocalIntent('वापस')).toMatchObject({ intent: 'go_back' });
  });

  it('carries the transcript and locale through untouched', () => {
    const r = matchLocalIntent('go home', 'hi');
    expect(r?.transcript).toBe('go home');
    expect(r?.locale).toBe('hi');
  });
});

describe('matchLocalIntent — refusing to guess', () => {
  it('prefers the longer phrase when two rules overlap', () => {
    // "scroll down" must beat "down", "dark mode" must beat "dark".
    expect(matchLocalIntent('scroll down')).toMatchObject({
      intent: 'scroll',
      args: { direction: 'down' },
    });
    expect(matchLocalIntent('dark mode')).toMatchObject({
      intent: 'set_theme',
      args: { theme: 'dark' },
    });
  });

  it('matches whole words, never substrings', () => {
    // This is how a fast path starts doing the wrong thing confidently:
    // "homework" is not "home", "download" is not "down".
    expect(matchLocalIntent('homework')).toBeNull();
    expect(matchLocalIntent('download the file')).toBeNull();
  });

  it('hands a real sentence to the model instead of guessing', () => {
    expect(
      matchLocalIntent('can you please write a post about my morning run today'),
    ).toBeNull();
  });

  it('returns null for anything it does not recognise', () => {
    expect(matchLocalIntent('order me a pizza')).toBeNull();
    expect(matchLocalIntent('')).toBeNull();
    expect(matchLocalIntent('   ')).toBeNull();
  });

  it('never invents an intent outside the known set', () => {
    const known = new Set([
      'navigate', 'open_mini_app', 'set_feed', 'set_theme', 'refresh',
      'go_back', 'scroll', 'open_daily_question', 'create_post',
      'read_notifications', 'help',
    ]);
    for (const phrase of [
      'home', 'explore', 'chat', 'tools', 'profile', 'notes', 'tasks',
      'habits', 'trending', 'latest', 'dark', 'light', 'refresh', 'back',
      'scroll up', 'daily question', 'new post', 'help',
    ]) {
      const r = matchLocalIntent(phrase);
      expect(r, phrase).not.toBeNull();
      expect(known.has(r!.intent), `${phrase} -> ${r!.intent}`).toBe(true);
    }
  });
});

/**
 * Ordinary sentences must not perform actions.
 *
 * Every line below fired a command before the matcher required equality rather
 * than containment: "my mind feels light today" switched the theme, "i feel so
 * down today" scrolled, "my back hurts" navigated back. They are all short
 * enough to pass MAX_WORDS and all contain a word that is also a rule phrase,
 * which is exactly the shape of thing people speak into this product.
 *
 * A miss here is free — the utterance goes to the model, which is the designed
 * fallback. A false match is not: the app does something nobody asked for.
 */
describe('ordinary speech is never a command', () => {
  it.each([
    // the sentence the landing page itself suggests
    'my mind feels light today',
    'i feel so down today',
    'my back hurts',
    'i am going home now',
    'that video was funny',
    'i need money',
    'it is dark outside',
    'the light is beautiful',
    'i want to go back to sleep',
    'this chat was lovely',
    'my notes are messy',
    'lost track of time',
    'turn the light off',
    'walking home in the rain',
    'money is tight',
    'feeling up for it',
  ])('ignores %j', (said) => {
    expect(matchLocalIntent(said)).toBeNull();
  });
});

describe('real commands still resolve', () => {
  it.each([
    ['notes', 'Notes'],
    ['open my notes', 'Notes'],
    ['go home', 'Home'],
    ['home', 'Home'],
    ['dark mode', 'Dark'],
    ['scroll down', 'Scrolling'],
    ['go back', 'Back'],
    ['trending', 'Trending'],
    ['show me trending', 'Trending'],
    ['take me to explore', 'Explore'],
    ['what can you do', 'Help'],
    ['read my notifications', 'Reading notifications'],
    ['daily question', 'Daily question'],
    ['my profile', 'Profile'],
    ['खोज', 'Explore'],
    ['नोट खोलो', 'Notes'],
    ['ghar', 'Home'],
    ['post karo', 'New echo'],
  ])('%j still means %s', (said, reply) => {
    expect(matchLocalIntent(said)?.reply).toBe(reply);
  });
});

describe('on-device navigation covers the whole app', () => {
  it('resolves screens that have no hand-written rule, with no network', () => {
    // Before this, only nine navigations were local; everything else — selling
    // an item, editing a profile, blocked users — cost a round trip and a model
    // call to reach a table the device already had.
    // Asserted on the resolved ROUTE, not the matched key: "show me my reports"
    // strips "my" as filler and matches the "reports" key, which is correct and
    // is the sort of detail a key-level assertion would fight for no reason.
    const cases: Array<[string, string]> = [
      ['open my blocked users', '/blocked-users'],
      ['sell', '/create-listing'],
      ['edit profile', '/edit-profile'],
      ['go to office hours', '/office-hours'],
      ['show me my reports', '/my-reports'],
      ['take me to privacy policy', '/privacy'],
    ];
    for (const [said, route] of cases) {
      const r = matchLocalIntent(said);
      expect(r, `"${said}" should resolve on device`).not.toBeNull();
      expect(r!.intent).toBe('navigate');
      expect(DESTINATIONS[String(r!.args.destination)]).toBe(route);
    }
  });

  it('speaks a readable confirmation back', () => {
    expect(matchLocalIntent('notification settings')!.reply).toBe('Notification prefs');
  });

  it('still refuses a sentence that merely mentions a screen word', () => {
    // The table holds ordinary words. Containment would hand "report" every
    // sentence that uses it; equality-after-filler does not.
    for (const said of ['i should report that later', 'can you share this with them', 'that story was good']) {
      expect(matchLocalIntent(said), `"${said}" must fall through to the model`).toBeNull();
    }
  });
});

describe('dictation', () => {
  it('extracts the payload after an explicit prefix', () => {
    const r = matchLocalIntent('reply I will be there in ten minutes');
    expect(r?.intent).toBe('dictate');
    expect(r?.args.text).toBe('I will be there in ten minutes');
  });

  it('runs before the length gate, because dictation is long by nature', () => {
    // Every other rule refuses more than MAX_WORDS words. The prefix, not the
    // length, is what carries the evidence here.
    const long = 'type ' + 'one two three four five six seven eight nine ten';
    expect(matchLocalIntent(long)?.intent).toBe('dictate');
  });

  it('keeps the words exactly as spoken', () => {
    // normalise() strips punctuation and case, which is right for matching a
    // command and wrong for words a person is about to send to someone.
    const r = matchLocalIntent("write Sorry, I'm late — see you at 6!");
    expect(r?.args.text).toBe("Sorry, I'm late — see you at 6!");
  });

  it('works in Hindi', () => {
    const r = matchLocalIntent('लिखो आज नहीं आ पाऊंगा');
    expect(r?.intent).toBe('dictate');
    expect(r?.args.text).toBe('आज नहीं आ पाऊंगा');
  });

  it('needs a separator, so "writer" is not "write" plus "r"', () => {
    expect(matchLocalIntent('writer')?.intent).not.toBe('dictate');
  });

  it('needs a payload — a bare prefix is not dictation', () => {
    // "write" alone is the composer destination, and must stay that.
    expect(matchLocalIntent('write')?.intent).toBe('navigate');
    expect(matchLocalIntent('type')).toBeNull();
  });
});
