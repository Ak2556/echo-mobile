-- Fix: cleanup_on_echo_unlike() compared a uuid column to a text value.
--
-- notifications.target_id is uuid (declared uuid since 20260502130000), but the
-- cleanup trigger added in 20260504010000 did `target_id = old.echo_id::text`.
-- Postgres has no uuid = text operator, so the AFTER DELETE trigger on
-- echo_likes raised `operator does not exist: uuid = text` — meaning EVERY
-- unlike (and any delete of a liked echo, including user-deletion cascades)
-- failed at the database. Surfaced by the load-test teardown.
--
-- Drop the erroneous cast; compare uuid to uuid.

create or replace function public.cleanup_on_echo_unlike()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.notifications
  where type        = 'like'
    and actor_id    = old.user_id
    and target_id   = old.echo_id      -- was old.echo_id::text (uuid vs text)
    and target_kind = 'echo';
  return old;
end;
$$;
