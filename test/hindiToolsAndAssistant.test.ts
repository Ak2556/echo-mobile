import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TT_PHRASES } from '../lib/i18n/i18nPhrases';
import { MINI_APP_CATALOG } from '../lib/mini-apps/miniAppCatalog';
import { pickProactiveOpener, type ProactiveContext } from '../lib/ai/proactiveAI';

// 2026-11-25: with Hindi selected, the Tools tab kept "Continue Notes", "…remembers
// where you left off" and English tool names, and the assistant greeted in English
// with English chips, "Ask"/"Do" and "Message the assistant…". Hindi is a launch
// language, so every string on these two screens needs a static Hindi line: the
// runtime machine translation depends on the AI quota and was not filling them.

const hi = (TT_PHRASES as Record<string, Record<string, string> | undefined>).hi ?? {};
const read = (p: string) => readFileSync(p, 'utf8');
const DEVANAGARI = /[ऀ-ॿ]/;

describe('Tools tab in Hindi', () => {
  const src = read('app/(tabs)/apps.tsx');

  it('draws every tool name through ttx', () => {
    expect(src).not.toMatch(/>\s*\{app\.name\}\s*</);
    expect(src).not.toMatch(/`Continue \$\{/);
    expect(src).not.toMatch(/`Tools for \$\{/);
  });

  it('has Hindi for every tool name', () => {
    for (const s of MINI_APP_CATALOG.map(a => a.name)) expect(hi[s], s).toBeTruthy();
  });
});

describe('Assistant screen in Hindi', () => {
  const ctx = (over: Partial<ProactiveContext>): ProactiveContext => ({
    name: 'Akash', hour: 15, partOfDay: 'afternoon', targetOutcome: '', habitsDueToday: 0, habitsDoneToday: 0,
    streakAtRisk: null, bestStreak: null, focusToday: 0, focusGoal: 4, lastChat: null, daysSinceLastChat: null,
    topMemory: null, ...over,
  });
  const cases: Array<[string, Partial<ProactiveContext>]> = [
    ['streak', { streakAtRisk: { name: 'Run', streak: 5 } }],
    ['welcome back', { daysSinceLastChat: 4, lastChat: { title: 'x', ageDays: 4 } as never }],
    ['continue', { lastChat: { title: 'Trip plan', ageDays: 1 } as never }],
    ['morning habits', { partOfDay: 'morning', hour: 8, habitsDueToday: 2 }],
    ['morning plan', { partOfDay: 'morning', hour: 8 }],
    ['evening focus', { partOfDay: 'evening', hour: 19, focusToday: 2 }],
    ['evening', { partOfDay: 'evening', hour: 19 }],
    ['afternoon', {}],
  ];

  it.each(cases)('greets in Hindi: %s', (_, over) => {
    const o = pickProactiveOpener(ctx(over), 'hi');
    expect(o.message).toMatch(DEVANAGARI);
    // English words a template could leak; user content (names, titles) is allowed.
    expect(o.message).not.toMatch(/\b(you|today|want|the|days|habit|focus|Morning|Evening|Hey)\b/);
    for (const chip of o.chips) expect(hi[chip], chip).toBeTruthy();
  });

  it('keeps English as it was', () => {
    expect(pickProactiveOpener(ctx({}), 'en').message).toMatch(/^Hey, Akash/);
  });

  it('shows chips, Ask/Do and the input placeholder through ttx, with Hindi', () => {
    expect(read('app/(tabs)/chat.tsx')).toMatch(/\{ttx\(chip\)\}/);
    const input = read('components/ai/ChatInput.tsx');
    const placeholders = [...input.matchAll(/ttx\('((?:Message|Responding)[^']*)'\)/g)].map(m => m[1]);
    expect(placeholders.length, 'placeholder goes through ttx').toBe(2);
    for (const s of ['Ask', 'Do', ...placeholders]) expect(hi[s], s).toBeTruthy();
  });
});
