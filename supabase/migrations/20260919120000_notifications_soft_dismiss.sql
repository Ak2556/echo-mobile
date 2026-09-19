-- Let someone clear a notification without deleting it.
--
-- There was no way to remove a single notification — only "mark all read",
-- which changes a dot and leaves the row. The table has SELECT and UPDATE
-- policies and no DELETE, so a client delete is refused by RLS; rather than
-- open a delete path, this marks the row dismissed and filters it out.
--
-- Soft rather than hard on purpose. push-fanout and the retention work read
-- this table as history, a dismissal is reversible if someone asks, and the
-- existing UPDATE policy already covers it — no new kind of write.

alter table public.notifications
  add column if not exists dismissed_at timestamptz;

-- The list reads "mine, newest first, not dismissed". A partial index keeps
-- that on the same shape as the existing (user_id, created_at desc) one
-- without carrying the dismissed rows it will never return.
create index if not exists idx_notifications_user_active
  on public.notifications (user_id, created_at desc)
  where dismissed_at is null;

-- The update policy checked only the row being read, not the row being
-- written, so a client could move one of its notifications to another user_id.
-- Dismissal makes that path load-bearing, so it is closed here rather than
-- left for later.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only the two columns a client is supposed to touch. Everything else on this
-- table is written by the server: push-fanout owns type, actor_id, preview and
-- target_*, and a client that can rewrite those can forge a notification that
-- looks like it came from someone else.
revoke update on public.notifications from authenticated;
grant update (read_at, dismissed_at) on public.notifications to authenticated;

comment on column public.notifications.dismissed_at is
  'Set when the recipient swipes the row away. Non-null rows are filtered from the list; the row is kept because push-fanout and retention read this table as history.';
