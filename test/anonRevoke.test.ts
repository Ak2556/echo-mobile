import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 20261118090000 takes anon's SELECT grant off tables that serve no anonymous reader. This pins the
 * two ways that goes wrong: revoking a table the public surface depends on (the download page,
 * share links and signed-out browsing break with a 404), and the sensitive tables dropping off
 * the list.
 */
const sql = readFileSync(
  join(resolve(__dirname, '..'), 'supabase/migrations/20261118090000_revoke_anon_select_unused_tables.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');
const revoked = new Set([...sql.matchAll(/public\.(\w+)/g)].map(m => m[1]));

// Each of these has a policy that deliberately lets anon read it (checked on the live project 2026-11-18).
const ANON_SERVES = [
  'ads', 'badges', 'comment_likes', 'comment_mentions', 'comment_reactions', 'daily_answer_reactions',
  'daily_answers', 'daily_question_bank', 'daily_questions', 'echo_comments', 'echo_likes', 'echo_mentions',
  'echo_reactions', 'echo_reposts', 'feature_flags', 'follows', 'learn_packages', 'learn_slots',
  'learn_tutors', 'marketplace_listings', 'office_hour_question_upvotes', 'office_hour_questions',
  'office_hour_rsvps', 'office_hours', 'profiles', 'public_echoes', 'quests', 'salon_members', 'salons',
  'user_badges', 'notification_groups', 'echo_reaction_summary', 'visible_echoes',
];

describe('anon SELECT revoke', () => {
  it('only revokes SELECT, from anon', () => {
    expect(sql).toMatch(/revoke\s+select\s+on\s+table/i);
    expect(sql).toMatch(/\bfrom\s+anon\s*;/i);
    expect(sql).not.toMatch(/\bauthenticated\b|\bservice_role\b|\bgrant\b/i);
  });

  it('leaves every table anon is meant to read alone', () => {
    expect(ANON_SERVES.filter(t => revoked.has(t))).toEqual([]);
  });

  it('covers the tables that must never be readable by the public key', () => {
    for (const t of [
      'push_tokens', 'user_entitlements', 'whatsapp_links', 'rag_embedding_messages',
      'subscription_webhook_events', 'ai_messages', 'dm_conversations', 'notifications', 'user_blocks',
    ]) expect(revoked.has(t), t).toBe(true);
  });
});
