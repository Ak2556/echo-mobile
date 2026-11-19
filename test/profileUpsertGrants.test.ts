import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// profiles has column-level grants (20260622100000 revoked the table-wide ones).
// A client upsert is INSERT ... ON CONFLICT DO UPDATE SET col = EXCLUDED.col,
// and Postgres needs INSERT, UPDATE *and SELECT* on every column it names, even
// when the row exists. Missing any of them fails the whole write with
// "permission denied for table profiles".
//
// It happened in the signup wizard with onboarded_at and date_of_birth (INSERT,
// 20260926120000), personalized_notifications (INSERT, 20261119120000), and
// date_of_birth again (SELECT, which clients must never get: the age gate hides
// birthdays). No new account finished signing up from 2026-09-30 to 2026-11-19,
// with nothing failing in CI. The birthday now goes by plain UPDATE
// (saveMyDateOfBirth), which needs UPDATE only. Replayed on production as the
// authenticated role inside a rolled-back transaction on 2026-11-19.

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function granted(privilege: 'insert' | 'update' | 'select'): Set<string> {
  const cols = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '');
    // Grants and revokes in file order, so a later revoke wins.
    const re = /\b(grant|revoke)\s+([^;]*?)\s+on\s+(?:table\s+)?public\.profiles\s+(to|from)\s+([^;]*);/gi;
    for (const m of sql.matchAll(re)) {
      if (!/\bauthenticated\b/i.test(m[4])) continue;
      // "insert (a, b), update (c)": take the column list after this privilege.
      const clause = new RegExp(`\\b${privilege}\\s*\\(([^)]*)\\)`, 'i').exec(m[2]);
      if (!clause) continue;
      const list = clause[1].split(',').map(c => c.trim()).filter(Boolean);
      for (const c of list) (m[1].toLowerCase() === 'grant' ? cols.add(c) : cols.delete(c));
    }
  }
  return cols;
}

/** Keys of the object literal passed to `.from('profiles').upsert(` in a file. */
function upsertColumns(rel: string): string[] {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const at = src.search(/from\('profiles'\)\s*\.upsert\(/);
  expect(at, `${rel} no longer upserts profiles; update this test`).toBeGreaterThan(-1);
  const open = src.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    if (src[end] === '}' && --depth === 0) break;
  }
  const body = src.slice(open, end + 1).replace(/\/\/[^\n]*/g, '');
  return [...new Set([...body.matchAll(/\b([a-z_]+)\s*:/g)].map(m => m[1]))];
}

const UPSERTS = ['app/auth/signup-wizard.tsx', 'lib/supabaseEchoApi.ts'];

describe('client upserts on profiles have the column grants they need', () => {
  const insert = granted('insert');
  const update = granted('update');
  const select = granted('select');

  for (const rel of UPSERTS) {
    it(`${rel}: every column is granted INSERT, UPDATE and SELECT to authenticated`, () => {
      const cols = upsertColumns(rel);
      expect(cols).toContain('id');
      expect(cols.filter(c => !insert.has(c)), 'columns without INSERT').toEqual([]);
      expect(cols.filter(c => c !== 'id' && !update.has(c)), 'columns without UPDATE').toEqual([]);
      expect(cols.filter(c => !select.has(c)), 'columns without SELECT (ON CONFLICT DO UPDATE reads them)').toEqual([]);
    });
  }

  it('date_of_birth is unreadable by clients, so it can never be in an upsert', () => {
    expect(select.has('date_of_birth')).toBe(false);
    for (const rel of UPSERTS) expect(upsertColumns(rel)).not.toContain('date_of_birth');
  });

  it('the wizard saves the birthday by plain update before marking onboarding done', () => {
    const src = readFileSync(join(ROOT, 'app/auth/signup-wizard.tsx'), 'utf8');
    const dob = src.indexOf('await saveMyDateOfBirth(dobIso)');
    const upsert = src.search(/from\('profiles'\)\s*\.upsert\(/);
    expect(dob).toBeGreaterThan(-1);
    expect(dob).toBeLessThan(upsert);
    expect(upsertColumns('app/auth/signup-wizard.tsx')).toContain('onboarded_at');
  });

  it('the wizard never sends a null bio: the column is NOT NULL', () => {
    const src = readFileSync(join(ROOT, 'app/auth/signup-wizard.tsx'), 'utf8');
    expect(src).not.toMatch(/bio:\s*bioText\.trim\(\)\s*\|\|\s*null/);
  });
});
