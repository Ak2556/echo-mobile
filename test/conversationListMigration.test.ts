import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raw = readFileSync('supabase/migrations/20261005160000_conversation_list_index_driven.sql', 'utf8');
const flat = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ');

describe('get_dm_conversations is index-driven', () => {
  it('no longer filters every conversation through the membership function', () => {
    expect(flat).not.toMatch(/is_dm_conversation_member/);
  });

  it('finds the caller\'s conversations through the three indexes that exist for it', () => {
    expect(flat).toMatch(/coalesce\(dc\.is_group, false\) = false and dc\.user_a = caller\.uid/);
    expect(flat).toMatch(/coalesce\(dc\.is_group, false\) = false and dc\.user_b = caller\.uid/);
    expect(flat).toMatch(/from public\.dm_conversation_members m join public\.dm_conversations dc on dc\.id = m\.conversation_id, caller where caller\.uid is not null and m\.user_id = caller\.uid and coalesce\(dc\.is_group, false\) = true/);
  });

  it('the three branches are disjoint, so UNION ALL returns exactly the old rows', () => {
    expect(flat.match(/union all/g)?.length).toBe(2);
  });

  it('keeps the contract: same columns, SECURITY DEFINER, service-role handling, ordering', () => {
    expect(flat).toMatch(/security definer set search_path to 'public'/);
    expect(flat).toMatch(/request\.jwt\.claims/);
    expect(flat).toMatch(/order by dc\.last_message_at desc nulls last/);
    expect(flat).toMatch(/unread_count bigint/);
  });
});
