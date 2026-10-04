import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * public.profiles has column-level SELECT grants, not a table-level one
 * (20260622100000_identity_surface_hardening revoked the table grant). With
 * column grants a single ungranted column fails the WHOLE select with 42501
 * "permission denied for table profiles" — so one forgotten grant silently
 * breaks every screen that runs that query.
 *
 * This test reads the columns the client actually selects from profiles and
 * checks each one against the grants in the migrations. It caught
 * last_seen_at, which shipped in 20260815121000 without a grant and made the
 * chat header read "User / @unknown" for every conversation.
 */

const ROOT = resolve(__dirname, '..');
const APP_DIRS = ['lib', 'app', 'src', 'hooks', 'components'];
const CLIENT_ROLES = ['anon', 'authenticated'];

function sourceFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    if (entry === 'node_modules') return [];
    const path = join(full, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

/** Column names in a supabase-js select() list, minus embedded relations. */
function columnsInSelect(list: string): string[] {
  return list
    .replace(/\([^)]*\)/g, '') // drop embedded-relation column lists
    .split(',')
    .map(part => part.trim())
    .map(part => (part.includes(':') ? part.split(':').pop()!.trim() : part)) // alias:column
    .filter(part => part.length > 0 && part !== '*' && /^[a-z_][a-z0-9_]*$/.test(part));
}

/** Every profiles column the client reads, with the file that reads it. */
function selectedProfileColumns(): Map<string, string> {
  const found = new Map<string, string>();
  // The select() must be the one chained onto this from() — stop at the next
  // .from( so a profiles query never pairs with another table's select list.
  const query = /\.from\(\s*['"]profiles['"]\s*\)((?:(?!\.from\()[\s\S]){0,300}?)\.select\(\s*(['"`])([\s\S]*?)\2/g;

  for (const file of APP_DIRS.flatMap(sourceFiles)) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(query)) {
      for (const column of columnsInSelect(match[3])) {
        if (!found.has(column)) found.set(column, file.slice(ROOT.length + 1));
      }
    }
  }
  return found;
}

/** Columns granted to anon/authenticated, replaying migrations in order. */
function grantedProfileColumns(): { columns: Set<string>; tableWide: boolean } {
  const dir = join(ROOT, 'supabase/migrations');
  const columns = new Set<string>();
  let tableWide = false;

  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');

    for (const stmt of sql.split(';')) {
      if (!/\bon\s+public\.profiles\b/i.test(stmt)) continue;

      const revoke = /\brevoke\s+([\s\S]*?)\s+on\s+public\.profiles\b/i.exec(stmt);
      if (revoke && /\bselect\b/i.test(revoke[1])) {
        const revokedList = /select\s*\(([^)]*)\)/i.exec(revoke[1]);
        if (revokedList) {
          // Column-scoped revoke: only those columns go away.
          for (const column of columnsInSelect(revokedList[1])) columns.delete(column);
        } else {
          // Table-level revoke: nothing is readable until re-granted.
          columns.clear();
          tableWide = false;
        }
        continue;
      }

      const grant = /\bgrant\s+([\s\S]*?)\s+on\s+public\.profiles\s+to\s+([\s\S]*)$/i.exec(stmt);
      if (!grant) continue;
      const roles = grant[2].toLowerCase();
      if (!CLIENT_ROLES.some(role => roles.includes(role))) continue;

      const columnList = /select\s*\(([^)]*)\)/i.exec(grant[1]);
      if (columnList) {
        for (const column of columnsInSelect(columnList[1])) columns.add(column);
      } else if (/\bselect\b/i.test(grant[1])) {
        tableWide = true;
      }
    }
  }
  return { columns, tableWide };
}

describe('public.profiles column grants', () => {
  it('grants every column the client selects', () => {
    const selected = selectedProfileColumns();
    const { columns: granted, tableWide } = grantedProfileColumns();

    expect(selected.size).toBeGreaterThan(0);

    const missing = tableWide
      ? []
      : [...selected].filter(([column]) => !granted.has(column)).map(([column, file]) => `${column} (read in ${file})`);

    expect(missing, 'ungranted profiles columns fail the whole SELECT with 42501').toEqual([]);
  });
});
