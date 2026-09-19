import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Dismissal is a soft delete, and the reasons are worth keeping.
 *
 * public.notifications has SELECT and UPDATE policies and no DELETE, so a
 * client delete is refused by RLS. Rather than open a delete path, the row is
 * marked `dismissed_at` and filtered out — which also keeps it for push-fanout
 * and the retention work, both of which read this table as history, and makes a
 * dismissal reversible if someone asks.
 *
 * The dangerous part is not the column, it is the grant. This table carries
 * `type`, `actor_id`, `preview` and `target_*`, all written by push-fanout. A
 * client that can update those can forge a notification that appears to come
 * from another user. So the migration revokes table-wide UPDATE and grants
 * exactly the two columns a recipient owns.
 *
 * Verified against Postgres before this was written: dismissing and marking
 * read both succeed, while rewriting actor_id or user_id is refused.
 */

const ROOT = resolve(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const sql = readdirSync(MIGRATIONS)
  .filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n')
  .replace(/--[^\n]*/g, '');

const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('notification dismissal', () => {
  it('adds the column rather than a delete path', () => {
    expect(flat(sql)).toMatch(/alter table public\.notifications add column if not exists dismissed_at/i);
    // A DELETE policy would be the other way to build this, and the one that
    // loses the history push-fanout depends on.
    expect(flat(sql), 'no DELETE policy should be introduced on notifications').not.toMatch(
      /create policy [^;]*on public\.notifications for delete/i,
    );
  });

  it('grants only the two columns a recipient owns', () => {
    const f = flat(sql);
    expect(f).toMatch(/revoke update on public\.notifications from authenticated/i);
    expect(f).toMatch(/grant update \(read_at, dismissed_at\) on public\.notifications to authenticated/i);
    // The forgeable ones must never appear in a grant on this table.
    const grants = [...f.matchAll(/grant update \(([^)]*)\) on public\.notifications/gi)].map(m => m[1]);
    expect(grants.length).toBeGreaterThan(0);
    for (const cols of grants) {
      for (const forgeable of ['actor_id', 'type', 'preview', 'target_id', 'user_id']) {
        expect(cols, `${forgeable} must not be client-writable`).not.toContain(forgeable);
      }
    }
  });

  it('the update policy checks the row being written, not just the one being read', () => {
    // Without a WITH CHECK a client could move its notification to another
    // user_id. The column grant blocks that too; this is the layer behind it.
    const f = flat(sql);
    const last = [...f.matchAll(/create policy "notifications_update_own" on public\.notifications([^;]*)/gi)].pop();
    expect(last, 'the policy must exist').toBeTruthy();
    expect(last![1]).toMatch(/with check \(\s*auth\.uid\(\) = user_id\s*\)/i);
  });

  it('the list query filters dismissed rows out', () => {
    const api = readFileSync(join(ROOT, 'lib/supabaseEchoApi.ts'), 'utf8');
    expect(api, 'fetchRemoteNotifications must exclude dismissed rows').toMatch(
      /\.is\('dismissed_at', null\)/,
    );
  });

  it('there is an index that matches how the list reads', () => {
    // "mine, newest first, not dismissed" — a partial index keeps the dismissed
    // rows out of the structure that will never return them.
    expect(flat(sql)).toMatch(
      /create index if not exists idx_notifications_user_active on public\.notifications \(user_id, created_at desc\) where dismissed_at is null/i,
    );
  });

  it('the local store removes only the one row', () => {
    const slice = readFileSync(join(ROOT, 'store/slices/socialSlice.ts'), 'utf8');
    const body = slice.slice(slice.indexOf('dismissNotification: (id)'));
    expect(body.slice(0, 260)).toMatch(/filter\(n => n\.id !== id\)/);
    expect(body.slice(0, 260), 'the local list is persisted, so it must be written back').toMatch(
      /persistSet\('notifications'/,
    );
  });

  it('the optimistic update keeps the paged cache shape', () => {
    // Writing a flat array over an InfiniteData cache does not just fail to
    // update — it destroys pageParams, and the list silently stops paging.
    const hook = readFileSync(join(ROOT, 'hooks/queries/useNotifications.ts'), 'utf8');
    const body = hook.slice(hook.indexOf('export function useDismissNotification'));
    expect(body).toMatch(/pages: old\.pages\.map\(page => page\.filter\(n => n\.id !== id\)\)/);
    expect(body, 'a failed dismissal must roll back, or the row reappears on refetch').toMatch(
      /onError[\s\S]*setQueryData\(\['notifications'\], ctx\.prev\)/,
    );
  });
});
