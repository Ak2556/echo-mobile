import { describe, expect, it } from 'vitest';
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
