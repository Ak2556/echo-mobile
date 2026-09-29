-- Live reactions in DM threads.
--
-- The thread screen listened for INSERT/DELETE on message_reactions, but that
-- table is not in the supabase_realtime publication, so the listeners never
-- fired: a partner's reaction appeared only after some other refetch.
--
-- Publishing message_reactions is the wrong fix. It has no conversation_id to
-- filter on, so every open thread would receive every reaction in the app and
-- refetch for each one, and DELETE events skip RLS entirely.
--
-- Instead a reaction marks its message. direct_messages is already published
-- and the thread already listens for UPDATE filtered to its own conversation,
-- so the change reaches exactly the members of that conversation (Realtime
-- checks each subscriber's SELECT policy) and nobody else.

alter table public.direct_messages
  add column if not exists reactions_changed_at timestamptz;

comment on column public.direct_messages.reactions_changed_at is
  'Bumped by message_reactions changes so the row''s UPDATE carries them over realtime. Not read by the client.';

-- authenticated holds table-level SELECT on direct_messages today; the column
-- grant is explicit so a later switch to column-level grants cannot silently
-- drop this column from the realtime payload check.
grant select (reactions_changed_at) on public.direct_messages to authenticated;

create or replace function public.touch_dm_on_reaction()
returns trigger
language plpgsql
-- Reactors may not update direct_messages (no UPDATE grant, and the row is
-- usually someone else's). This writes one timestamp on one row, the message
-- the reaction points at, and nothing the caller supplies beyond that id.
security definer
set search_path = ''
as $$
begin
  update public.direct_messages
     set reactions_changed_at = now()
   where id = coalesce(new.message_id, old.message_id);
  return null;
end;
$$;

revoke all on function public.touch_dm_on_reaction() from public, anon, authenticated;

drop trigger if exists trg_touch_dm_on_reaction on public.message_reactions;
create trigger trg_touch_dm_on_reaction
  after insert or delete on public.message_reactions
  for each row execute function public.touch_dm_on_reaction();
