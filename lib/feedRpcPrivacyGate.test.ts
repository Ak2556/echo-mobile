import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Feed RPCs are SECURITY DEFINER, and a definer function does not run under
 * RLS. public.public_echoes carries a policy whose whole purpose is hiding
 * private accounts' echoes from non-followers, so every definer function that
 * reads that table has to re-implement the gate — and for a long time none of
 * them did. Any caller could read private accounts' echoes, and three of the
 * functions were granted to `anon`, whose key ships inside the app bundle.
 *
 * 20260910120000 repointed them at public.visible_echoes, which applies
 * can_view_echo_author. This test fails if a new definer function reads the
 * raw table again, because that is the eighth instance of a bug that has
 * already happened seven times.
 */

const ROOT = resolve(__dirname, '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');

/**
 * Functions that must see every echo, private ones included, with why.
 * Adding to this list is a security decision — it should be argued in review,
 * not slipped in to make a red test go green.
 */
const MAY_READ_RAW_TABLE = new Map([
  ['public.moderator_remove_echo', 'moderation acts on all content, including private accounts'],
  ['public.resweep_unmoderated_echoes', 'maintenance sweep over everything awaiting moderation'],
  ['public.refresh_user_taste', "computes the caller's own taste vector; already guarded to auth.uid()"],
]);

/** Latest definition of every function, migrations applied in filename order. */
function latestFunctionDefinitions(): Map<string, { file: string; head: string; body: string }> {
  const out = new Map<string, { file: string; head: string; body: string }>();
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\([^)]*\)([\s\S]*?)(\$\w*\$)([\s\S]*?)\3\s*;/gi;

  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const m of sql.matchAll(pattern)) {
      out.set(m[1].toLowerCase(), { file, head: m[2], body: m[4] });
    }
  }
  return out;
}

describe('feed RPCs respect private accounts', () => {
  const definitions = latestFunctionDefinitions();

  it('parses the migrations at all', () => {
    expect(definitions.size).toBeGreaterThan(50);
  });

  it('no SECURITY DEFINER read function queries public_echoes directly', () => {
    const offenders: string[] = [];

    for (const [name, { file, head, body }] of definitions) {
      if (!/security\s+definer/i.test(head)) continue;
      // Triggers fire on write and return nothing to a caller, so they cannot
      // leak a row to someone who should not see it.
      if (/returns\s+trigger/i.test(head)) continue;
      if (!/public\.public_echoes/i.test(body)) continue;
      if (MAY_READ_RAW_TABLE.has(name)) continue;
      offenders.push(`${name} (${file}) — read public.public_echoes; use public.visible_echoes`);
    }

    expect(
      offenders,
      'a SECURITY DEFINER function bypasses RLS, so reading public_echoes directly exposes private accounts',
    ).toEqual([]);
  });

  it('the gate mirrors the RLS policy it stands in for', () => {
    const gate = definitions.get('public.can_view_echo_author');
    expect(gate, 'can_view_echo_author must exist').toBeDefined();
    // The three arms of the policy in 20260809100000_harden_rls.
    expect(gate!.body).toMatch(/auth\.uid\(\)\s*=\s*p_author_id/i);
    expect(gate!.body).toMatch(/is_private\s*=\s*false/i);
    expect(gate!.body).toMatch(/public\.follows/i);
  });

  it('every allowlisted exemption still exists', () => {
    // Stops the list rotting into a set of names that no longer mean anything.
    for (const name of MAY_READ_RAW_TABLE.keys()) {
      expect(definitions.has(name), `${name} is allowlisted but no longer defined`).toBe(true);
    }
  });
});
