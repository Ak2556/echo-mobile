-- Add last_seen_at to profiles for activity tracking
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- Function for the client to ping its presence periodically
create or replace function public.ping_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid();
$$;

-- Update get_dm_conversations to return other_last_seen_at
drop function if exists public.get_dm_conversations(uuid);
create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
returns table (
  id                  uuid,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_color  text,
  other_last_seen_at  timestamptz,
  is_group            boolean,
  group_title         text,
  group_avatar_color  text,
  member_count        bigint,
  last_message_at     timestamptz,
  last_message_text   text,
  last_message_kind   text,
  unread_count        bigint
) language sql security definer stable set search_path = public as $$
  with visible_conversations as (
    select dc.*
      from public.dm_conversations dc
     where public.is_dm_conversation_member(dc.id, p_user_id)
  )
  select
    dc.id,
    case
      when dc.is_group then null
      when dc.user_a = p_user_id then dc.user_b
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
         and dm.sender_id != p_user_id
         and dm.read_at is null
         and dm.deleted_at is null
    ) as unread_count
  from visible_conversations dc
  left join public.profiles p on p.id = (
    case
      when dc.is_group then null
      when dc.user_a = p_user_id then dc.user_b
      else dc.user_a
    end
  )
  order by dc.last_message_at desc nulls last;
$$;
