import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A moderation verdict must land only on the content it judged. embed-echo can
 * take seconds (model calls with retries), and an edit in that window starts a
 * second run; whichever finishes last used to win, so a slow approval of the
 * old text could publish an edit nobody had checked.
 *
 * The contract has two halves, and each is a one-line filter that is easy to
 * lose in a refactor: the trigger that versions content, and the version
 * guard on every write embed-echo makes about that content.
 */
const root = resolve(__dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260928100000_moderation_content_version.sql'),
  'utf8',
);
const embedEcho = readFileSync(resolve(root, 'supabase/functions/embed-echo/index.ts'), 'utf8');

describe('moderation verdicts are bound to a content version', () => {
  it('versions content on every path, after the guards that settle it', () => {
    expect(migration).toMatch(/create trigger d_bump_echo_content_version\s+before insert or update on public\.public_echoes/);
    // Runs after a_guard_client_writes, b_guard_media_provenance, c_hold_moderated_content.
    expect(['a_guard_client_writes', 'b_guard_media_provenance', 'c_hold_moderated_content', 'd_bump_echo_content_version'].sort()
      .at(-1)).toBe('d_bump_echo_content_version');
    expect(migration).toMatch(/\(new\.title, new\.prompt, new\.response, new\.media_urls\)\s+is distinct from/);
    expect(migration).toMatch(/new\.moderated_at := null/);
  });

  it('reads the version with the row it judges', () => {
    expect(embedEcho).toMatch(/\.select\("[^"]*\bcontent_version\b[^"]*"\)/);
  });

  it('writes the verdict and the embedding only where that version is still current', () => {
    const guarded = embedEcho.match(/\.eq\("content_version", echoRow\.content_version\)/g) ?? [];
    expect(guarded.length).toBe(2);
    expect(embedEcho).toMatch(
      /update\(\{ check_content: verdict\.ok, moderated_at:[^}]*\}\)\s*\.eq\("id", echoId\)\s*\.eq\("content_version", echoRow\.content_version\)/,
    );
  });
});
