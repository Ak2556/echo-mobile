/**
 * The feature_flags table overrides the compiled defaults in lib/core/featureFlags.ts,
 * so the two must agree unless someone flips a row on purpose. They drifted
 * once: e2eeSend was seeded false while the build compiled true, so a fresh
 * install sealed DMs until its first flag fetch and then silently stopped.
 *
 * This replays every insert and update on public.feature_flags in migration
 * order and compares the result with the compiled map. A deliberate
 * divergence (a feature killed remotely) belongs in DIVERGES_ON_PURPOSE with
 * its reason.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FLAGS } from '../lib/core/featureFlags';

const DIVERGES_ON_PURPOSE: Record<string, string> = {};

const dir = resolve(__dirname, '../supabase/migrations');

function replayMigrations(): Map<string, boolean> {
  const state = new Map<string, boolean>();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(resolve(dir, file), 'utf8').replace(/--[^\n]*/g, '');
    const events: { at: number; apply: () => void }[] = [];

    for (const m of sql.matchAll(/insert\s+into\s+public\.feature_flags\s*\([^)]*\)\s*values([\s\S]*?);/gi)) {
      const doNothing = /on\s+conflict\s*\(key\)\s*do\s+nothing/i.test(m[0]);
      for (const row of m[1].matchAll(/\(\s*'(\w+)'\s*,\s*(true|false)\b/gi)) {
        const [, key, value] = row;
        events.push({ at: m.index! + row.index!, apply: () => {
          if (!(doNothing && state.has(key))) state.set(key, value.toLowerCase() === 'true');
        } });
      }
    }
    for (const m of sql.matchAll(/update\s+public\.feature_flags\s+set\s+enabled\s*=\s*(true|false)\b[\s\S]*?where\s+key\s*=\s*'(\w+)'/gi)) {
      const [, value, key] = m;
      events.push({ at: m.index!, apply: () => state.set(key, value.toLowerCase() === 'true') });
    }
    events.sort((a, b) => a.at - b.at).forEach(e => e.apply());
  }
  return state;
}

describe('feature_flags rows match the compiled defaults', () => {
  const migrated = replayMigrations();

  it('every compiled flag has a row', () => {
    const missing = Object.keys(FLAGS).filter(k => !migrated.has(k));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(FLAGS))('%s: migrations leave it at the compiled default', (key, compiled) => {
    if (key in DIVERGES_ON_PURPOSE) return;
    expect(migrated.get(key)).toBe(compiled);
  });

  it('e2eeSend ends on, so a fresh install keeps sealing after its first fetch', () => {
    expect(migrated.get('e2eeSend')).toBe(true);
  });
});
