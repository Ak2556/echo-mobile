import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HI_BULK } from '../lib/i18n/i18nPhrasesHi';

/**
 * Guards for the Terms / Privacy agreement gate. The behaviour of the SQL itself is proved by running it
 * (see the PR); these pin the properties a later edit could quietly lose.
 */
const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('legal_acceptances migration', () => {
  const sql = read('supabase/migrations/20261117120000_legal_acceptances.sql');

  it('has row level security on and gives the client roles no direct table access', () => {
    expect(sql).toMatch(/alter table public\.legal_acceptances enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.legal_acceptances from anon, authenticated/i);
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+public\.legal_acceptances/i);
  });

  it('cascades with the account, so erasing a user erases the record', () => {
    expect(sql).toMatch(/references auth\.users \(id\) on delete cascade/i);
  });

  it('takes no user id: the caller is auth.uid()', () => {
    expect(sql).not.toMatch(/p_user_id|p_viewer_id/);
    expect(sql).toMatch(/auth\.uid\(\)/);
  });

  it('pins search_path on both definer functions and keeps anon out', () => {
    expect((sql.match(/security definer/gi) ?? []).length).toBe(2);
    expect((sql.match(/set search_path = public/gi) ?? []).length).toBe(2);
    expect(sql).toMatch(/revoke all on function public\.record_legal_acceptance\(text, text\) from public, anon/i);
    expect(sql).toMatch(/revoke all on function public\.get_my_legal_acceptance\(\) from public, anon/i);
  });
});

describe('TermsGate wiring', () => {
  it('is mounted in the root layout, ahead of the birthday card', () => {
    const layout = read('app/_layout.tsx');
    const terms = layout.indexOf('<TermsGate />');
    const age = layout.indexOf('<AgeConfirmGate />');
    expect(terms).toBeGreaterThan(-1);
    expect(age).toBeGreaterThan(terms);
  });

  it('makes the birthday card wait, because iOS cannot present two modals at once', () => {
    expect(read('components/onboarding/AgeConfirmGate.tsx')).toMatch(/useTermsGateStore/);
    expect(read('components/legal/TermsGate.tsx')).toMatch(/useTermsGateStore/);
  });

  it('never locks anyone out on a failed read and keeps the gate up on a failed save', () => {
    const src = read('components/legal/TermsGate.tsx');
    expect(src).toMatch(/catch\(\(\) => \{ \/\* see the note above/);
    expect(src).toMatch(/setFailed\(true\)/);
  });

  it('reaches the database only through the API layer', () => {
    expect(read('components/legal/TermsGate.tsx')).not.toMatch(/from '\.\.\/\.\.\/lib\/supabase'/);
  });
});

describe('Hindi for the gate', () => {
  const strings = [
    'Before you continue',
    'Echo is for people aged 18 and over. Please read and agree to our Terms of Service and Privacy Policy to keep using Echo.',
    'Read the Terms of Service',
    'Read the Privacy Policy',
    'Could not save your choice. Check your connection and try again.',
    'Agree and continue',
    'Decline and sign out',
  ];
  for (const s of strings) {
    it(`translates "${s.slice(0, 40)}"`, () => {
      expect(HI_BULK[s]).toBeTruthy();
    });
  }

  it('uses every string the component shows', () => {
    const src = read('components/legal/TermsGate.tsx');
    for (const s of strings) expect(src).toContain(s);
  });
});
