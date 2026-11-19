import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/i18n', () => ({ ttx: (s: string) => s }));

import { signupSaveOutcome } from './signupSaveError';

const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });

describe('signupSaveOutcome', () => {
  it('never shows a database error to the person signing up', () => {
    // The 2026-11-19 report: a tester's phone showed "permission denied for table profiles".
    const out = signupSaveOutcome(pg('42501', 'permission denied for table profiles'));
    expect(out.message).not.toMatch(/permission|table|profiles/i);
    expect(out.message).toMatch(/Continue/);
    expect(out.report).toBe(true);
    expect(out.goTo).toBeNull();
  });

  it('reports an unknown failure, so a broken signup reaches monitoring instead of a toast', () => {
    expect(signupSaveOutcome(new Error('something odd')).report).toBe(true);
  });

  it('sends a taken username back to the name step and clears it', () => {
    const out = signupSaveOutcome(pg('23505', 'duplicate key value violates unique constraint "profiles_username_key"'));
    expect(out).toMatchObject({ goTo: 'name', clearUsername: true, report: false });
    expect(out.message).toMatch(/username/i);
  });

  it('turns a text-filter refusal into plain words and the step that holds the text', () => {
    expect(signupSaveOutcome(pg('EC001', 'text_filter:username'))).toMatchObject({ goTo: 'name', report: false, clearUsername: false });
    expect(signupSaveOutcome(pg('EC001', 'text_filter:display_name')).goTo).toBe('name');
    const bio = signupSaveOutcome(pg('EC001', 'text_filter:bio'));
    expect(bio.goTo).toBe('bio');
    expect(bio.message).not.toMatch(/text_filter/);
  });

  it('tells an offline person to reconnect, without reporting it', () => {
    const out = signupSaveOutcome(new TypeError('Network request failed'));
    expect(out.message).toMatch(/offline/i);
    expect(out.report).toBe(false);
  });
});

describe('signup save messages in Hindi', () => {
  it('has a hand-written Hindi line for every message, so none waits on the AI translator', async () => {
    const { HI_BULK } = await import('../i18n/i18nPhrasesHi');
    const src = (await import('node:fs')).readFileSync(`${process.cwd()}/lib/auth/signupSaveError.ts`, 'utf8');
    const strings = [...src.matchAll(/ttx\((['"])(.*?)\1\)/g)].map(m => m[2]);
    expect(strings.length).toBe(3);
    for (const s of strings) expect(HI_BULK[s], s).toBeTruthy();
  });
});
