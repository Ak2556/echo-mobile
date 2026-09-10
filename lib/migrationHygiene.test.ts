import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Two ways a migration that re-emits an existing function silently breaks it,
 * both of which happened while writing 20260910120000:
 *
 *   1. Re-emitting from the last CREATE drops whatever a later ALTER set. The
 *      pgvector search_path fix (20260830044247) is an ALTER, so a re-emitted
 *      CREATE reverted it and `<=>` stopped resolving — the function compiled
 *      and failed at runtime with 42883.
 *   2. Copying a definition that was new at the time reuses its bare
 *      `create function`, which collides with the function that now exists
 *      (42723).
 *
 * Neither is visible by reading the migration; both are caught here.
 */

const MIGRATIONS = resolve(__dirname, '..', 'supabase/migrations');
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

interface Statement { file: string; name: string; index: number }

const CREATE_ANY = /create\s+(or\s+replace\s+)?function\s+(public\.[\w]+)\s*\(/gi;
const ALTER_SEARCH_PATH = /alter\s+function\s+(public\.[\w]+)\s*\([^)]*\)\s*set\s+search_path\s*=\s*([^;]+);/gi;

describe('migration hygiene', () => {
  it('reads the migrations', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never redefines an existing function with a bare CREATE', () => {
    const defined = new Map<string, string>();
    const collisions: string[] = [];

    files.forEach(file => {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
      for (const m of sql.matchAll(CREATE_ANY)) {
        const orReplace = Boolean(m[1]);
        const name = m[2].toLowerCase();
        // A bare CREATE is legitimate when the same file drops the function
        // first — the pattern used when a return type changes, which
        // CREATE OR REPLACE cannot express.
        const droppedFirst = new RegExp(
          `drop\\s+function\\s+if\\s+exists\\s+${name.replace('.', '\\.')}\\s*\\(`, 'i',
        ).test(sql.slice(0, m.index ?? 0));

        if (defined.has(name) && !orReplace && !droppedFirst) {
          collisions.push(`${name} in ${file} — already defined in ${defined.get(name)}; needs OR REPLACE or a DROP first`);
        }
        defined.set(name, file);
      }
    });

    expect(collisions, 'a bare CREATE for an existing function fails with 42723').toEqual([]);
  });

  it('never drops a search_path an earlier ALTER established', () => {
    // name -> the setting the most recent ALTER applied, and where.
    const required = new Map<string, { setting: string; file: string }>();
    const regressions: string[] = [];

    files.forEach(file => {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

      // Redefinitions first: a CREATE in this file must honour any setting an
      // ALTER in an EARLIER file established.
      for (const m of sql.matchAll(CREATE_ANY)) {
        const name = m[2].toLowerCase();
        const need = required.get(name);
        if (!need) continue;

        // The settings clause sits between the signature and the body.
        const from = m.index ?? 0;
        const bodyAt = sql.indexOf('$', from);
        const head = sql.slice(from, bodyAt === -1 ? from + 2000 : bodyAt);

        const missing = need.setting
          .split(',')
          .map(s => s.trim().replace(/['"]/g, ''))
          .filter(schema => schema && !new RegExp(`\\b${schema}\\b`).test(head));

        if (missing.length > 0) {
          regressions.push(
            `${name} in ${file} drops search_path schema(s) [${missing.join(', ')}] ` +
            `set by ${need.file}`,
          );
        }
      }

      for (const m of sql.matchAll(ALTER_SEARCH_PATH)) {
        required.set(m[1].toLowerCase(), { setting: m[2], file });
      }
    });

    expect(regressions, 'a re-emitted CREATE silently reverts a later ALTER').toEqual([]);
  });
});
