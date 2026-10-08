import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261005150000_follower_count_single_trigger.sql', 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ');
const api = readFileSync('lib/supabaseEchoApi.ts', 'utf8');
const hook = readFileSync('hooks/queries/useRemoteProfile.ts', 'utf8');

describe('follower count migration', () => {
  it('removes the duplicate trigger that counted every follow twice, and only that one', () => {
    expect(sql).toMatch(/drop trigger if exists on_follow_change on public\.follows/);
    expect(sql).not.toMatch(/drop trigger if exists follows_adjust_follower_count/);
  });

  it('recomputes every count from follows, including profiles that fell to zero', () => {
    expect(sql).toMatch(/set follower_count = c\.n from \(select following_id, count\(\*\)::integer as n from public\.follows group by following_id\) c/);
    expect(sql).toMatch(/set follower_count = 0 where p\.follower_count is distinct from 0 and not exists \(select 1 from public\.follows f where f\.following_id = p\.id\)/);
  });
});

describe('profile screen latency', () => {
  it('the follower count is a profile-row read, not a count over follows', () => {
    const fn = api.slice(api.indexOf('export async function fetchRemoteFollowersCount'), api.indexOf('export async function fetchRemoteFollowingCount'));
    expect(fn).toMatch(/\.select\('follower_count'\)/);
    expect(fn).not.toMatch(/count: 'exact'/);
  });

  it('echoes and the author are fetched together, and an already-fetched profile is reused', () => {
    const fn = api.slice(api.indexOf('export async function fetchRemoteEchoesByAuthor'), api.indexOf('export async function isRemoteFollowing'));
    expect(fn).toMatch(/author\?: SupabaseProfileRow \| null \| Promise<SupabaseProfileRow \| null>/);
    expect(fn).toMatch(/Promise\.all\(\[\s*supabase\s*\.from\('public_echoes'\)/);
  });

  it('with an id in hand, the profile, echoes, following count and follow state go at once', () => {
    expect(hook).toMatch(/Promise\.all\(\[\s*profilePromise,\s*fetchRemoteEchoesByAuthor\(targetId, profilePromise\),\s*fetchRemoteFollowingCount\(targetId\),\s*following\(targetId\),\s*requested\(targetId\),\s*\]\)/);
    expect(hook).toMatch(/const followerCount = profile\.follower_count \?\? 0/);
    // No sequential "do I follow them" after the group any more.
    expect(hook).not.toMatch(/await isRemoteFollowing\(profileId\)/);
  });
});
