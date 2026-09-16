import { describe, expect, it } from 'vitest';
import { matchLocalIntent as appMatch, normalise as appNormalise } from '../../lib/voice/localIntent';
import { matchLocalIntent as pageMatch, normalise as pageNormalise } from './intent.js';

/**
 * The hero lets a visitor speak and then shows what Echo understood. That is
 * only honest if the page runs the SAME parser the phone runs.
 *
 * public/download/intent.js is generated from lib/voice/localIntent.ts by
 * scripts/prepare-web-assets.mjs. These tests are what stop the two drifting:
 * add a rule to the app without regenerating and this fails, rather than the
 * landing page quietly demonstrating behaviour the product no longer has.
 */

const CORPUS = [
  // every intent family the parser knows
  'home', 'go home', 'open my notes', 'notes', 'tasks', 'habits', 'pomodoro',
  'money', 'fitness', 'explore', 'search', 'chat', 'tools', 'profile',
  'settings', 'bookmarks', 'notifications', 'for you', 'trending', 'following',
  'latest', 'dark mode', 'light mode', 'refresh', 'back', 'go back',
  'scroll down', 'scroll up', 'daily question', 'new post', 'help',
  'what can you do', 'read my notifications',

  // Devanagari and romanised Hindi, both of which real recognition returns
  'होम', 'खोज', 'नोट', 'खर्च', 'आदत', 'डार्क', 'वापस', 'नीचे', 'ऊपर', 'मदद',
  'ghar', 'post karo',

  // the conservative-matching cases the app comments call out by name
  'downtown', 'homework', 'i went downtown yesterday',

  // things that must NOT match
  '', '   ', 'the quick brown fox jumped over the lazy dog today',
  'my mind feels light today',
  'remind me to call Ma at seven tomorrow',

  // punctuation and casing
  'Home.', 'NOTES!', '  dark   mode  ', "what can you do?",
];

describe('the page parser matches the app parser', () => {
  it.each(CORPUS)('agrees on %j', (input) => {
    expect(pageNormalise(input)).toBe(appNormalise(input));
    expect(pageMatch(input)).toEqual(appMatch(input));
  });

  // If someone adds a rule to localIntent.ts and does not regenerate, the
  // counts diverge — this is the check that notices.
  it('carries every rule the app has', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
    const appSrc = read('lib/voice/localIntent.ts');
    const pageSrc = read('public/download/intent.js');
    const count = (s: string) => (s.match(/\bintent: '/g) || []).length;
    expect(count(pageSrc)).toBe(count(appSrc));
  });
});
