-- Warm avatar palette migration.
-- 1) Remap stored identity colors from the legacy saturated palette to the
--    warm editorial one (see lib/avatarPalette.ts for the same map).
-- 2) Warm default for new rows.
-- 3) get_dm_conversations now returns other_avatar_url so DM lists can show
--    profile photos, not just initials.

update public.profiles set avatar_color = case lower(avatar_color)
  when '#6366f1' then '#5E748B'
  when '#3b82f6' then '#4E7A8B'
  when '#8b5cf6' then '#8B5E7D'
  when '#a78bfa' then '#8B5E7D'
  when '#ec4899' then '#B35D6B'
  when '#f472b6' then '#B35D6B'
  when '#ef4444' then '#A04E4E'
  when '#f59e0b' then '#B08536'
  when '#f97316' then '#C65F3F'
  when '#fb923c' then '#C65F3F'
  when '#10b981' then '#4E8B7A'
  when '#4ade80' then '#7A8B4E'
  when '#84cc16' then '#7A8B4E'
  when '#14b8a6' then '#4E8B7A'
  when '#06b6d4' then '#4E7A8B'
  when '#38bdf8' then '#4E7A8B'
  else avatar_color
end
where lower(avatar_color) in (
  '#6366f1','#3b82f6','#8b5cf6','#a78bfa','#ec4899','#f472b6','#ef4444',
  '#f59e0b','#f97316','#fb923c','#10b981','#4ade80','#84cc16','#14b8a6',
  '#06b6d4','#38bdf8'
);

alter table public.profiles alter column avatar_color set default '#C65F3F';

-- Group conversations picked colors from the old palette too.
update public.dm_conversations set avatar_color = case lower(avatar_color)
  when '#6366f1' then '#5E748B'
  when '#3b82f6' then '#4E7A8B'
  when '#8b5cf6' then '#8B5E7D'
  when '#ec4899' then '#B35D6B'
  when '#ef4444' then '#A04E4E'
  when '#f59e0b' then '#B08536'
  when '#f97316' then '#C65F3F'
  when '#10b981' then '#4E8B7A'
  when '#06b6d4' then '#4E7A8B'
  else avatar_color
end
where avatar_color is not null;

-- Same definition as 20260712111000 plus other_avatar_url and a warm
-- group-color fallback.
drop function if exists public.get_dm_conversations(uuid);
create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
returns table (
  id                  uuid,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_color  text,
  other_avatar_url    text,
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
    p.avatar_url as other_avatar_url,
    dc.is_group,
    dc.title as group_title,
    coalesce(dc.avatar_color, '#C65F3F') as group_avatar_color,
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
  left join public.profiles p
    on p.id = case
      when dc.is_group then null
      when dc.user_a = p_user_id then dc.user_b
      else dc.user_a
    end
  order by dc.last_message_at desc nulls last
  limit 80;
$$;

grant execute on function public.get_dm_conversations(uuid) to authenticated;
