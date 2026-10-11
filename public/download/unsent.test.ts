import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MESSAGES, PEOPLE, STRINGS, formatSeconds, messagesFor, personLabel, raceTarget, uiLang } from './unsent.js';

const page = readFileSync(resolve(__dirname, 'index.html'), 'utf8');

/** The keys the keyboard race can actually press. A key like क्ष is three code points and the
 *  race compares one code point at a time, so only single-code-point keys count. */
function raceKeys(name: 'QWERTY' | 'DEVANAGARI'): Set<string> {
  const m = page.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n  \\];'));
  if (!m) throw new Error('could not find ' + name + ' in index.html');
  const keys = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).filter(k => [...k].length === 1);
  return new Set(keys);
}

describe('people and messages', () => {
  it('has three messages for every person, with unique ids', () => {
    expect(new Set(PEOPLE.map(p => p.id)).size).toBe(PEOPLE.length);
    for (const p of PEOPLE) expect(messagesFor(p.id), p.id).toHaveLength(3);
  });

  it('gives every message both languages', () => {
    for (const list of Object.values(MESSAGES)) {
      for (const m of list) {
        expect(m.en.length).toBeGreaterThan(5);
        expect(m.hi).toMatch(/[ऀ-ॿ]/);
      }
    }
  });

  it('labels every person in both languages and falls back to English for others', () => {
    for (const p of PEOPLE) {
      expect(personLabel(p.id, 'en')).toBe(p.en);
      expect(personLabel(p.id, 'hi')).toBe(p.hi);
      expect(personLabel(p.id, 'ta')).toBe(p.en);
    }
  });
});

describe('only Hindi and English are shown fully', () => {
  it('maps every other page language to English', () => {
    expect(uiLang('hi')).toBe('hi');
    for (const code of ['en', 'bn', 'ta', 'ar', 'ur', undefined, '']) expect(uiLang(code as string)).toBe('en');
  });

  it('has a Hindi string for every English string', () => {
    expect(Object.keys(STRINGS.hi).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
});

describe('the keyboard race can type every sentence', () => {
  it('reduces English to lowercase letters the race has', () => {
    const letters = raceKeys('QWERTY');
    for (const list of Object.values(MESSAGES)) {
      for (const m of list) {
        const t = raceTarget(m.en, 'en');
        expect(t.length, m.en).toBeGreaterThan(3);
        for (const ch of t) expect(ch === ' ' || letters.has(ch), `${m.en} -> ${ch}`).toBe(true);
      }
    }
  });

  it('keeps Hindi to characters on the Devanagari grid', () => {
    const grid = raceKeys('DEVANAGARI');
    for (const list of Object.values(MESSAGES)) {
      for (const m of list) {
        const t = raceTarget(m.hi, 'hi');
        for (const ch of t) expect(ch === ' ' || grid.has(ch), `${m.hi} -> U+${ch.codePointAt(0)!.toString(16)}`).toBe(true);
      }
    }
  });

  it('strips punctuation and capitals', () => {
    expect(raceTarget("Ma, I'm fine. Do not worry!", 'en')).toBe('ma im fine do not worry');
    expect(raceTarget('मां, आज आपकी याद आई।', 'hi')).toBe('मां आज आपकी याद आई');
  });

  it('keeps each target short enough to finish', () => {
    for (const list of Object.values(MESSAGES)) {
      for (const m of list) {
        expect([...raceTarget(m.hi, 'hi')].length, m.hi).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('formatSeconds', () => {
  it('rounds to one decimal and never goes negative', () => {
    expect(formatSeconds(3240)).toBe('3.2s');
    expect(formatSeconds(-5)).toBe('0.0s');
  });
});
