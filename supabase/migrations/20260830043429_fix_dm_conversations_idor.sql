-- SECURITY: get_dm_conversations trusted a caller-supplied identity (IDOR).
--
-- The function is SECURITY DEFINER and EXECUTE is granted to anon+authenticated,
-- but its only authorization gate was
--     public.is_dm_conversation_member(dc.id, p_user_id)
-- where p_user_id comes straight from the caller. `DEFAULT auth.uid()` is only a
-- default — any caller could pass an explicit uuid instead and receive that
-- user's entire conversation list, including other_user_id, last_message_at and
-- last_message_text (a DM content preview) plus unread counts. The anon key is
-- shipped in the client bundle, so this was reachable without an account.
--
-- Fix: derive the identity server-side from the JWT and ignore the parameter for
-- normal callers. The parameter is kept so the existing client call
-- (lib/supabaseEchoApi.ts fetchRemoteConversations, which already passes its own
-- uid) keeps working unchanged; only service_role may still pass an explicit id,
-- since it has no auth.uid() of its own. For anon, auth.uid() is null and the
-- guard yields zero rows.
--
-- Same class, lower severity: mark_messages_read updated rows by conversation id
-- with no membership check, so any authenticated user could clear unread state on
-- a conversation they are not part of.

create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
 returns table(id uuid, other_user_id uuid, other_username text, other_display_name text, other_avatar_color text, other_last_seen_at timestamp with time zone, is_group boolean, group_title text, group_avatar_color text, member_count bigint, last_message_at timestamp with time zone, last_message_text text, last_message_kind text, unread_count bigint)
 language sql
 stable security definer
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
       and public.is_dm_conversation_member(dc.id, caller.uid)
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

create or replace function public.mark_messages_read(p_conversation_id uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.direct_messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id != auth.uid()
     and read_at is null
     and public.is_dm_conversation_member(p_conversation_id, auth.uid());
$function$;
