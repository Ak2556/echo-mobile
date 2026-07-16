-- Group admin controls: manage members, roles, and metadata after creation.
-- All mutations go through security-definer RPCs that enforce admin rights,
-- so the client can't escalate. Reads (member list) require membership.

-- New groups pick a warm identity color (matches the app palette) instead of
-- the legacy indigo default.
alter table public.dm_conversations alter column avatar_color set default '#C65F3F';

-- ── Member list (member-visible) ──────────────────────────────────────────
create or replace function public.get_group_members(p_conversation_id uuid)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_color text,
  avatar_url   text,
  role         text,
  joined_at    timestamptz
) language sql security definer stable set search_path = public as $$
  select m.user_id, p.username, p.display_name, p.avatar_color, p.avatar_url, m.role, m.joined_at
    from public.dm_conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_conversation_id
     and public.is_dm_conversation_member(p_conversation_id, auth.uid())
   order by (m.role = 'admin') desc, lower(coalesce(p.display_name, p.username));
$$;

grant execute on function public.get_group_members(uuid) to authenticated;

-- ── Admin guard (raises if caller isn't an admin of the group) ─────────────
create or replace function public.assert_group_admin(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admins only';
  end if;
end;
$$;

-- ── Add members (admin) ────────────────────────────────────────────────────
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_group_admin(p_conversation_id);
  insert into public.dm_conversation_members (conversation_id, user_id, role)
  select p_conversation_id, member_id, 'member'
    from (select distinct unnest(p_member_ids) as member_id) s
   where member_id is not null
  on conflict do nothing;
  -- Cap group size (owner + 63).
  if (select count(*) from public.dm_conversation_members where conversation_id = p_conversation_id) > 64 then
    raise exception 'group is full';
  end if;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- ── Remove a member (admin) ────────────────────────────────────────────────
create or replace function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_group_admin(p_conversation_id);
  if p_user_id = auth.uid() then
    raise exception 'use leave_group to remove yourself';
  end if;
  delete from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- ── Promote / demote (admin) ───────────────────────────────────────────────
create or replace function public.set_group_member_role(p_conversation_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_group_admin(p_conversation_id);
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role';
  end if;
  update public.dm_conversation_members
     set role = p_role
   where conversation_id = p_conversation_id and user_id = p_user_id;
  -- Never leave a group without an admin.
  if not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and role = 'admin'
  ) then
    raise exception 'a group needs at least one admin';
  end if;
end;
$$;

grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;

-- ── Rename / recolor (admin) ───────────────────────────────────────────────
create or replace function public.update_group_meta(p_conversation_id uuid, p_title text, p_avatar_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_group_admin(p_conversation_id);
  update public.dm_conversations
     set title = coalesce(nullif(trim(p_title), ''), title),
         avatar_color = coalesce(nullif(trim(p_avatar_color), ''), avatar_color)
   where id = p_conversation_id and coalesce(is_group, false) = true;
end;
$$;

grant execute on function public.update_group_meta(uuid, text, text) to authenticated;

-- ── Leave a group (self); promote the earliest member if the last admin ────
create or replace function public.leave_group(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_was_admin boolean;
begin
  select role = 'admin' into v_was_admin
    from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = v_uid;

  delete from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = v_uid;

  -- If the last admin left, hand the crown to the earliest remaining member.
  if coalesce(v_was_admin, false) and not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and role = 'admin'
  ) then
    update public.dm_conversation_members
       set role = 'admin'
     where conversation_id = p_conversation_id
       and user_id = (
         select user_id from public.dm_conversation_members
          where conversation_id = p_conversation_id
          order by joined_at asc limit 1
       );
  end if;
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;
