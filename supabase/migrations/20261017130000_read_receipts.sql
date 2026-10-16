-- Read receipts that keep their promise. See docs/superpowers/specs/2026-10-16-presence-design.md, section 8.
--
-- Until now mark_messages_read always set direct_messages.read_at, which the sender can read, so the
-- "Read receipts" toggle protected nothing, and read_at was also what unread counts were built on.
-- This separates the two:
--   dm_read_state.last_read_at   private, per member and conversation: drives unread counts and badges
--   direct_messages.read_at      the receipt the sender sees: only set when the READER has receipts on
-- Unread keeps its old meaning (messages from others newer than the marker, and not followed by a
-- reply of mine), so counts do not change for anyone on the day this ships.

create table if not exists public.dm_read_state (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null,
  primary key (conversation_id, user_id)
);
alter table public.dm_read_state enable row level security;   -- no policies: reached only through the functions below
revoke all on public.dm_read_state from anon, authenticated;

-- Backfill so nothing flips on deploy: each member's marker is the latest read_at among messages from
-- others (or the conversation's creation time when they have read nothing), which reproduces the old
-- "read_at is null" count exactly because mark_messages_read always marked everything at once.
insert into public.dm_read_state (conversation_id, user_id, last_read_at)
select m.conversation_id, m.user_id,
       coalesce((select max(dm.read_at) from public.direct_messages dm
                  where dm.conversation_id = m.conversation_id and dm.sender_id <> m.user_id and dm.read_at is not null),
                dc.created_at)
  from (
    select c.id as conversation_id, c.user_a as user_id from public.dm_conversations c where coalesce(c.is_group, false) = false and c.user_a is not null
    union
    select c.id, c.user_b from public.dm_conversations c where coalesce(c.is_group, false) = false and c.user_b is not null
    union
    select gm.conversation_id, gm.user_id from public.dm_conversation_members gm
  ) m
  join public.dm_conversations dc on dc.id = m.conversation_id
on conflict (conversation_id, user_id) do nothing;

create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  receipts boolean;
  previous timestamptz;
begin
  if me is null or not public.is_dm_conversation_member(p_conversation_id, me) then return; end if;

  select rs.last_read_at into previous
    from public.dm_read_state rs
   where rs.conversation_id = p_conversation_id and rs.user_id = me;

  insert into public.dm_read_state as rs (conversation_id, user_id, last_read_at)
  values (p_conversation_id, me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  select p.read_receipts into receipts from public.profiles p where p.id = me;
  if coalesce(receipts, true) then
    -- Only what was unread a moment ago. Messages read privately while receipts were off must not
    -- turn into receipts the day they are switched back on.
    update public.direct_messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and sender_id <> me
       and read_at is null
       and created_at > coalesce(previous, '-infinity'::timestamptz);
  end if;
end;
$$;
revoke all on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- The thread needs the marker to place its "New messages" divider without relying on read_at.
create or replace function public.get_my_read_marker(p_conversation_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select rs.last_read_at
    from public.dm_read_state rs
   where rs.conversation_id = p_conversation_id
     and rs.user_id = auth.uid();
$$;
revoke all on function public.get_my_read_marker(uuid) from public, anon;
grant execute on function public.get_my_read_marker(uuid) to authenticated;

create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
returns table(
  id uuid, other_user_id uuid, other_username text, other_display_name text,
  other_avatar_color text, other_last_seen_at timestamp with time zone, is_group boolean,
  group_title text, group_avatar_color text, member_count bigint,
  last_message_at timestamp with time zone, last_message_text text, last_message_kind text,
  unread_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with caller as (
    select case
      when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
        then coalesce(p_user_id, auth.uid())
      else auth.uid()
    end as uid
  ),
  visible_conversations as (
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_a = caller.uid
    union all
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_b = caller.uid
    union all
    select dc.*
      from public.dm_conversation_members m
      join public.dm_conversations dc on dc.id = m.conversation_id, caller
     where caller.uid is not null
       and m.user_id = caller.uid
       and coalesce(dc.is_group, false) = true
  )
  select
    dc.id,
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end as other_user_id,
    p.username as other_username,
    p.display_name as other_display_name,
    p.avatar_color as other_avatar_color,
    p.last_seen_at as other_last_seen_at,
    dc.is_group,
    dc.title as group_title,
    coalesce(dc.avatar_color, '#6366F1') as group_avatar_color,
    case
      when dc.is_group then (
        select count(*) from public.dm_conversation_members m where m.conversation_id = dc.id
      )
      else 2
    end as member_count,
    dc.last_message_at,
    dc.last_message_text,
    dc.last_message_kind,
    (
      select count(*)
        from public.direct_messages dm
       where dm.conversation_id = dc.id
         and dm.sender_id != caller.uid
         and dm.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
         and dm.deleted_at is null
         and not exists (
           select 1
             from public.direct_messages dm2
            where dm2.conversation_id = dc.id
              and dm2.sender_id = caller.uid
              and dm2.created_at >= dm.created_at
         )
    ) as unread_count
  from visible_conversations dc
  cross join caller
  left join public.dm_read_state rs on rs.conversation_id = dc.id and rs.user_id = caller.uid
  left join public.profiles p on p.id = (
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end
  )
  order by dc.last_message_at desc nulls last;
$function$;
