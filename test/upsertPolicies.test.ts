/**
 * An upsert is an INSERT that becomes an UPDATE when the row exists, and row-level security
 * checks the UPDATE too. daily_answers had insert/select/delete policies and no update policy
 * from 2026-05-21 on, so the first answer saved and every edit failed with "Could not submit".
 * Nothing noticed: no unit test reaches RLS.
 *
 * So for every table the client upserts, one of these has to hold:
 *   - the call passes `ignoreDuplicates: true` (ON CONFLICT DO NOTHING needs only INSERT), or
 *   - the migrations define an UPDATE (or ALL) policy for the table, or
 *   - the table is in LIVE_ONLY below, with the evidence for why that is fine.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) yield p;
  }
}

/** Tables whose UPDATE policy exists on prod but is not written out in a migration. */
const LIVE_ONLY: Record<string, string> = {
  expense_settings: 'prod pg_policies: "own expense_settings — update" (2026-10-15)',
  expense_tx: 'prod pg_policies: "own expense_tx — update" (2026-10-15)',
  fitness_goals: 'prod pg_policies: "own fitness_goals — update" (2026-10-15)',
  // SELECT-only on prod, so the "persist for next time" write is always refused. The wrap is
  // computed and shown anyway, and the error is ignored, so nothing user-visible breaks.
  year_wraps: 'prod pg_policies: SELECT only; cache write is refused, wrap is recomputed',
};

function upserts(): { table: string; ignoresDuplicates: boolean; where: string }[] {
  const found: { table: string; ignoresDuplicates: boolean; where: string }[] = [];
  for (const dir of ['lib', 'app', 'components', 'hooks', 'store']) {
    for (const file of sources(join(ROOT, dir))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\.from\('([a-z_0-9]+)'\)\s*\.upsert\(/g)) {
        const start = m.index! + m[0].length;
        let depth = 1, i = start;
        while (i < text.length && depth > 0) { const c = text[i++]; if (c === '(') depth++; else if (c === ')') depth--; }
        found.push({ table: m[1], ignoresDuplicates: /ignoreDuplicates:\s*true/.test(text.slice(start, i)), where: file.slice(ROOT.length + 1) });
      }
    }
  }
  return found;
}

function migrationsSql(): string {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(join(dir, f), 'utf8')).join('\n');
}

describe('client upserts have a policy that lets them update', () => {
  const sql = migrationsSql();
  const hasUpdatePolicy = (t: string) =>
    new RegExp(`create policy[^;]*?on\\s+(public\\.)?${t}\\b[^;]*?for\\s+(update|all)\\b`, 'is').test(sql);

  it('finds the upserts it is meant to check', () => {
    const tables = new Set(upserts().map(u => u.table));
    expect(tables.has('daily_answers')).toBe(true);
    expect(tables.size).toBeGreaterThan(10);
  });

  it('every upserted table can be updated, or never updates', () => {
    const bad = upserts()
      .filter(u => !u.ignoresDuplicates && !hasUpdatePolicy(u.table) && !(u.table in LIVE_ONLY))
      .map(u => `${u.table} (${u.where})`);
    expect(bad, `upsert needs an UPDATE policy or ignoreDuplicates: ${bad.join(', ')}`).toEqual([]);
  });

  it('daily answers can be edited: an UPDATE policy exists and keeps the keys fixed', () => {
    expect(hasUpdatePolicy('daily_answers')).toBe(true);
    expect(sql).toMatch(/daily_answers_keep_keys/);
  });

  it('blocks, mutes and reactions are idempotent', () => {
    for (const t of ['user_blocks', 'user_mutes', 'message_reactions']) {
      const calls = upserts().filter(u => u.table === t);
      expect(calls.length, t).toBeGreaterThan(0);
      for (const c of calls) expect(c.ignoresDuplicates, `${t} in ${c.where}`).toBe(true);
    }
  });
});
