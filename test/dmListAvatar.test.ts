import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-11-27: every row in the Messages list showed an initial. 20261005160000
// rebuilt get_dm_conversations without other_avatar_url, which the app reads.
const sql = readFileSync('supabase/migrations/20261127120000_dm_list_avatar_url.sql', 'utf8');

describe('Messages list photos', () => {
  it('get_dm_conversations returns the other person\'s photo, never a group\'s', () => {
    expect(sql).toMatch(/unread_count bigint, other_avatar_url text\)/);
    expect(sql).toMatch(/case when dc\.is_group then null else p\.avatar_url end as other_avatar_url/);
  });

  it('the recreated function keeps production\'s grants: no anon', () => {
    expect(sql).toMatch(/revoke all on function public\.get_dm_conversations\(uuid\) from public;/);
    expect(sql).toMatch(/revoke all on function public\.get_dm_conversations\(uuid\) from anon;/);
    expect(sql).toMatch(/grant execute on function public\.get_dm_conversations\(uuid\) to authenticated;/);
  });

  it('the app maps it', () => {
    expect(readFileSync('lib/supabaseEchoApi.ts', 'utf8')).toMatch(/otherAvatarUrl: r\.is_group \? null : \(\(r\.other_avatar_url/);
  });
});
