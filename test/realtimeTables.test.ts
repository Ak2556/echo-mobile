import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A Realtime `postgres_changes` subscription only receives events for tables in the `supabase_realtime`
 * publication. Subscribing to any other table is silent: it connects, reports SUBSCRIBED and never fires.
 * That is how the "new echoes" pill on Home was dead in production for weeks.
 *
 * The publication is deliberately small (a global, unfiltered subscription to a busy table is an O(users)
 * fan-out). This list is what it contains; scripts/probe-flows.mjs checks the real publication against it.
 * To subscribe to a new table, add it to the publication in a migration AND to this list.
 */
const PUBLISHED = ['calls', 'direct_messages', 'notifications'];
const DIRS = ['app', 'components', 'hooks', 'lib', 'store'];

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });

describe('realtime subscriptions only target published tables', () => {
  const found: Array<{ file: string; table: string }> = [];
  for (const dir of DIRS) {
    for (const file of sources(dir)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/postgres_changes[\s\S]{0,400}?table:\s*['"]([a-z_]+)['"]/g)) {
        found.push({ file, table: m[1] });
      }
    }
  }

  it('finds the subscriptions it is meant to check', () => {
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(found.some((f) => f.table === 'direct_messages')).toBe(true);
  });

  it('none targets a table outside the publication', () => {
    const bad = found.filter((f) => !PUBLISHED.includes(f.table)).map((f) => `${f.file}: ${f.table}`);
    expect(bad).toEqual([]);
  });
});
