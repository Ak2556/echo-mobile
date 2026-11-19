import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// profiles has column-level grants (20260622100000 revoked the table-wide ones).
// A client upsert is INSERT ... ON CONFLICT DO UPDATE, and Postgres checks INSERT
// and UPDATE privilege on every column it names, even when the row exists. A
// column with only an UPDATE grant fails the whole write with "permission
// denied for table profiles".
//
// It happened three times in the signup wizard: onboarded_at, date_of_birth
// (both fixed 20260926120000), then personalized_notifications, added to the
// upsert on 2026-09-30 with no INSERT grant. From then until 2026-11-19 no new
// account finished signing up (0 of 5), with nothing failing in CI.

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function granted(privilege: 'insert' | 'update'): Set<string> {
  const cols = new Set<string>();
  for (const f of readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, '');
    const re = /grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.profiles\s+to\s+([^;]*);/gi;
    for (const m of sql.matchAll(re)) {
      if (!/\bauthenticated\b/i.test(m[2])) continue;
      // "insert (a, b), update (c)" — take the column list after this privilege.
      const clause = new RegExp(`\\b${privilege}\\s*\\(([^)]*)\\)`, 'i').exec(m[1]);
      if (clause) clause[1].split(',').map(c => c.trim()).filter(Boolean).forEach(c => cols.add(c));
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

  for (const rel of UPSERTS) {
    it(`${rel}: every column is granted INSERT and UPDATE to authenticated`, () => {
      const cols = upsertColumns(rel);
      expect(cols).toContain('id');
      expect(cols.filter(c => !insert.has(c)), 'columns without INSERT').toEqual([]);
      expect(cols.filter(c => c !== 'id' && !update.has(c)), 'columns without UPDATE').toEqual([]);
    });
  }

  it('the wizard still sends the columns this test was written for', () => {
    expect(upsertColumns('app/auth/signup-wizard.tsx')).toEqual(
      expect.arrayContaining(['date_of_birth', 'personalized_notifications', 'onboarded_at']),
    );
  });
});
