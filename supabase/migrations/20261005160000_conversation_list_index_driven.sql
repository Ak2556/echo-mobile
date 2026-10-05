-- get_dm_conversations: stop visiting every conversation in the app.
--
-- visible_conversations filtered dm_conversations with
--   public.is_dm_conversation_member(dc.id, uid)
-- A function call in WHERE cannot use an index, so the database ran it against
-- EVERY row of dm_conversations and kept the few that matched. Opening the chat
-- list therefore cost O(all conversations in the app), not O(this user's).
-- Measured on a local copy at 24,000 conversations: 82 ms for a user with 3
-- (it was 9 rows in production, so nobody felt it yet). The three indexes that
-- answer this question already existed (dm_conv_user_a_idx, dm_conv_user_b_idx,
-- idx_dm_members_user) and had never been scanned.
--
-- Same rule as is_dm_conversation_member, written so the planner can use them:
--   1:1 (is_group false or null): user_a = me, or user_b = me
--   group:                        a dm_conversation_members row for me
-- The branches are disjoint (a conversation is a group or not; user_a <> user_b),
-- so UNION ALL returns exactly the rows the function did.
--
-- Nothing else about the function changes: same columns, same SECURITY DEFINER
-- and caller handling, same unread_count and ordering.
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
         and dm.read_at is null
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
  left join public.profiles p on p.id = (
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end
  )
  order by dc.last_message_at desc nulls last;
$function$;
