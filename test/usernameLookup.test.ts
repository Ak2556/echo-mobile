import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261005120000_username_search_indexes.sql', 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const flat = migration.replace(/\s+/g, ' ');

describe('username / search / follows migration', () => {
  it('makes handles unique case-insensitively and drops the superseded non-unique index', () => {
    expect(flat).toMatch(/create unique index if not exists profiles_username_lower_key on public\.profiles \(lower\(username\)\)/);
    expect(flat).toMatch(/drop index if exists public\.profiles_username_lower_idx/);
  });

  it('serves ilike substring search with trigram indexes, schema-qualified', () => {
    expect(flat).toMatch(/profiles_username_trgm_idx on public\.profiles using gin \(username extensions\.gin_trgm_ops\)/);
    expect(flat).toMatch(/profiles_display_name_trgm_idx on public\.profiles using gin \(display_name extensions\.gin_trgm_ops\)/);
  });

  it('drops only the follows index that the primary key already covers', () => {
    expect(flat).toMatch(/drop index if exists public\.follows_follower_idx/);
    expect(flat).not.toMatch(/drop index if exists public\.follows_following_idx/);
  });

  it('username_available answers existence only, for signed-in callers only', () => {
    expect(flat).toMatch(/create or replace function public\.username_available\(p_username text\) returns boolean/);
    expect(flat).toMatch(/security definer set search_path = ''/);
    expect(flat).toMatch(/auth\.uid\(\) is not null/);
    expect(flat).toMatch(/lower\(p\.username\) = lower\(p_username\)/);
    expect(flat).toMatch(/p\.id <> auth\.uid\(\)/);
    expect(flat).toMatch(/revoke all on function public\.username_available\(text\) from public, anon/);
    expect(flat).toMatch(/grant execute on function public\.username_available\(text\) to authenticated/);
  });
});

describe('username check wiring', () => {
  const api = readFileSync('lib/supabaseEchoApi.ts', 'utf8');
  const wizard = readFileSync('app/auth/signup-wizard.tsx', 'utf8');

  it('the API asks the RPC, falls back if the function is missing, and caches per user', () => {
    expect(api).toMatch(/supabase\.rpc\('username_available'/);
    expect(api).toMatch(/PGRST202/);
    expect(api).toMatch(/createUsernameChecker\(\{ fetchTaken: fetchUsernameTaken \}\)/);
    expect(api).toMatch(/if \(uid !== usernameCheckerUid\)/);
  });

  it('the signup screen goes through the API instead of querying profiles itself', () => {
    expect(wizard).toMatch(/await isUsernameTaken\(usernameClean\)/);
    expect(wizard).not.toMatch(/\.from\('profiles'\)\s*\.select\('id'\)\s*\.eq\('username'/);
  });
});
