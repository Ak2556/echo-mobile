/**
 * Reactions reach an open DM thread as an UPDATE of their message.
 *
 * message_reactions is not in the supabase_realtime publication, and must not
 * be: it has no conversation_id to filter on, so a listener on it would get
 * every reaction in the app, and DELETE events skip RLS. A trigger instead
 * bumps direct_messages.reactions_changed_at, and the thread's existing
 * UPDATE listener (filtered to its conversation) refetches.
 *
 * Behaviour was verified against the local prod-schema copy (a member's
 * reaction and its removal both bump the column; a non-member cannot see the
 * row, so realtime never delivers it to them).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260929110000_dm_reactions_realtime.sql'), 'utf8');
const code = migration.replace(/--[^\n]*/g, '');
const hook = readFileSync(resolve(root, 'hooks/queries/useDMs.ts'), 'utf8');

describe('reaction trigger', () => {
  it('fires on both adding and removing a reaction', () => {
    expect(code).toMatch(/create trigger trg_touch_dm_on_reaction\s+after insert or delete on public\.message_reactions\s+for each row/i);
  });

  it('touches only the reacted message, by id', () => {
    expect(code).toMatch(/update public\.direct_messages\s+set reactions_changed_at = now\(\)\s+where id = coalesce\(new\.message_id, old\.message_id\)/i);
  });

  it('is a locked-down SECURITY DEFINER: pinned search_path, no EXECUTE for clients', () => {
    expect(code).toMatch(/security definer\s+set search_path = ''/i);
    expect(code).toMatch(/revoke all on function public\.touch_dm_on_reaction\(\) from public, anon, authenticated/i);
  });

  it('clients can read the new column but never write it', () => {
    expect(code).toMatch(/grant select \(reactions_changed_at\) on public\.direct_messages to authenticated/i);
    expect(code).not.toMatch(/grant[^;]*update[^;]*reactions_changed_at/i);
  });
});

describe('publication', () => {
  it('no migration publishes message_reactions', () => {
    const dir = resolve(root, 'supabase/migrations');
    const offenders = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .filter(f => /alter publication\s+supabase_realtime\s+add table[^;]*message_reactions/i
        .test(readFileSync(resolve(dir, f), 'utf8').replace(/--[^\n]*/g, '')));
    expect(offenders).toEqual([]);
  });
});

describe('thread subscription', () => {
  it('does not listen to message_reactions directly', () => {
    expect(hook).not.toMatch(/table: 'message_reactions'/);
  });

  it('still listens for UPDATE on its own conversation, which now carries reactions', () => {
    expect(hook).toMatch(/event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq\.\$\{conversationId\}`/);
  });
});
