import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDobFields, shouldAskForAge } from './ageConfirm';

describe('parseDobFields', () => {
  it('waits for a full date', () => {
    expect(parseDobFields('4', '7', '19')).toEqual({ check: null, iso: null });
  });

  it('accepts an adult and pads the ISO date', () => {
    const r = parseDobFields('4', '7', '1995');
    expect(r.check?.ok).toBe(true);
    expect(r.iso).toBe('1995-07-04');
  });

  it('rejects dates the calendar would roll over', () => {
    expect(parseDobFields('31', '2', '1995').check).toMatchObject({ ok: false, reason: 'implausible' });
  });

  it('rejects under-18s and future dates, and saves nothing', () => {
    const young = parseDobFields('1', '1', String(new Date().getUTCFullYear() - 10));
    expect(young.check).toMatchObject({ ok: false, reason: 'too-young' });
    expect(young.iso).toBeNull();
    expect(parseDobFields('1', '1', String(new Date().getUTCFullYear() + 1)).check).toMatchObject({ ok: false, reason: 'future' });
  });
});

describe('shouldAskForAge', () => {
  it('asks only when the server positively said there is no date of birth', () => {
    expect(shouldAskForAge({ signedIn: true, fetched: true, age: null })).toBe(true);
    expect(shouldAskForAge({ signedIn: true, fetched: true, age: 30 })).toBe(false);
  });

  it('never blocks on a failed or pending check, or when signed out', () => {
    expect(shouldAskForAge({ signedIn: true, fetched: false, age: undefined })).toBe(false);
    expect(shouldAskForAge({ signedIn: false, fetched: true, age: null })).toBe(false);
  });
});

describe('the gate is wired', () => {
  it('saves the birthday with personalized notifications, so the minors trigger sees an adult', () => {
    expect(readFileSync('lib/supabaseEchoApi.ts', 'utf8')).toMatch(/date_of_birth: dobIso,\s*personalized_notifications: true/);
  });

  it('is mounted app-wide and cannot be dismissed', () => {
    expect(readFileSync('app/_layout.tsx', 'utf8')).toMatch(/<AgeConfirmGate \/>/);
    const gate = readFileSync('components/onboarding/AgeConfirmGate.tsx', 'utf8');
    expect(gate).toMatch(/onRequestClose=\{\(\) => \{\}\}/);
    expect(gate).not.toMatch(/Remind me later|Skip/);
  });
});
