-- get_dm_conversations: return the other person's photo again.
--
-- 20260712140000 added other_avatar_url and the app has read it ever since
-- (lib/supabaseEchoApi.ts fetchRemoteConversations), but 20261005160000 rebuilt
-- the function without it. Every row in the Messages list has shown an initial
-- since, including for people with a photo (found 2026-11-27).
--
-- The body is the live definition (pg_get_functiondef, 2026-11-27) with one
-- column added at the end. Adding a column changes the return type, which
-- CREATE OR REPLACE cannot do, so the function is dropped and recreated, and its
-- grants are restored to what production had: authenticated and service_role
-- only. A new function is executable by PUBLIC (so anon) until revoked.
--
-- avatar_url is already null for someone who hid their photo: edit-profile
-- writes null when profile_photo_visible is off.

drop function if exists public.get_dm_conversations(uuid);

create function public.get_dm_conversations(p_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(id uuid, other_user_id uuid, other_username text, other_display_name text, other_avatar_color text, other_last_seen_at timestamp with time zone, is_group boolean, group_title text, group_avatar_color text, member_count bigint, last_message_at timestamp with time zone, last_message_text text, last_message_kind text, unread_count bigint, other_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ) as unread_count,
    case when dc.is_group then null else p.avatar_url end as other_avatar_url
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

revoke all on function public.get_dm_conversations(uuid) from public;
revoke all on function public.get_dm_conversations(uuid) from anon;
grant execute on function public.get_dm_conversations(uuid) to authenticated;
grant execute on function public.get_dm_conversations(uuid) to service_role;
