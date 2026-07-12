-- Group messaging on top of existing DM conversations/messages.

alter table public.dm_conversations
  add column if not exists is_group boolean not null default false,
  add column if not exists title text,
  add column if not exists avatar_color text default '#6366F1',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.dm_conversations
  alter column user_b drop not null;

do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.dm_conversations'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%user_a < user_b%'
  loop
    execute format('alter table public.dm_conversations drop constraint %I', c.conname);
  end loop;
end $$;

create table if not exists public.dm_conversation_members (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_dm_members_user
  on public.dm_conversation_members(user_id, conversation_id);

alter table public.dm_conversation_members enable row level security;

create or replace function public.is_dm_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.dm_conversations c
     where c.id = p_conversation_id
       and (
         (coalesce(c.is_group, false) = false and (c.user_a = p_user_id or c.user_b = p_user_id))
         or
         (coalesce(c.is_group, false) = true and exists (
            select 1
              from public.dm_conversation_members m
             where m.conversation_id = c.id
               and m.user_id = p_user_id
          ))
       )
  );
$$;

grant execute on function public.is_dm_conversation_member(uuid, uuid) to authenticated;

drop policy if exists "dm_members_select" on public.dm_conversation_members;
create policy "dm_members_select" on public.dm_conversation_members
  for select using (public.is_dm_conversation_member(conversation_id, auth.uid()));

drop policy if exists "dm_members_insert_admin" on public.dm_conversation_members;
create policy "dm_members_insert_admin" on public.dm_conversation_members
  for insert with check (
    exists (
      select 1
        from public.dm_conversation_members m
       where m.conversation_id = dm_conversation_members.conversation_id
         and m.user_id = auth.uid()
         and m.role = 'admin'
    )
  );

drop policy if exists "dm_members_delete_self_or_admin" on public.dm_conversation_members;
create policy "dm_members_delete_self_or_admin" on public.dm_conversation_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1
        from public.dm_conversation_members m
       where m.conversation_id = dm_conversation_members.conversation_id
         and m.user_id = auth.uid()
         and m.role = 'admin'
    )
  );

drop policy if exists "dm_conv_select_participants" on public.dm_conversations;
create policy "dm_conv_select_participants" on public.dm_conversations
  for select using (public.is_dm_conversation_member(id, auth.uid()));

drop policy if exists "dm_conv_insert_participant" on public.dm_conversations;
create policy "dm_conv_insert_participant" on public.dm_conversations
  for insert with check (
    (coalesce(is_group, false) = false and (auth.uid() = user_a or auth.uid() = user_b))
    or (coalesce(is_group, false) = true and auth.uid() = created_by)
  );

drop policy if exists "dm_conv_update_participants" on public.dm_conversations;
create policy "dm_conv_update_participants" on public.dm_conversations
  for update using (public.is_dm_conversation_member(id, auth.uid()));

drop policy if exists "dm_select_participants" on public.direct_messages;
create policy "dm_select_participants" on public.direct_messages
  for select using (public.is_dm_conversation_member(conversation_id, auth.uid()));

drop policy if exists "dm_insert_self" on public.direct_messages;
create policy "dm_insert_self" on public.direct_messages
  for insert with check (
    auth.uid() = sender_id
    and public.is_dm_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "dm_update_participants" on public.direct_messages;
create policy "dm_update_participants" on public.direct_messages
  for update using (public.is_dm_conversation_member(conversation_id, auth.uid()));

drop policy if exists "react_select" on public.message_reactions;
create policy "react_select" on public.message_reactions
  for select using (
    exists (
      select 1
        from public.direct_messages dm
       where dm.id = message_reactions.message_id
         and public.is_dm_conversation_member(dm.conversation_id, auth.uid())
    )
  );

create or replace function public.create_group_conversation(
  p_title text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := nullif(trim(p_title), '');
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) < 1 then
    raise exception 'choose at least one member';
  end if;

  insert into public.dm_conversations (user_a, user_b, is_group, title, avatar_color, created_by)
  values (v_uid, null, true, coalesce(v_title, 'Group chat'), '#6366F1', v_uid)
  returning id into v_conversation_id;

  insert into public.dm_conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_uid, 'admin')
  on conflict do nothing;

  insert into public.dm_conversation_members (conversation_id, user_id, role)
  select v_conversation_id, member_id, 'member'
    from (
      select distinct unnest(p_member_ids) as member_id
    ) s
   where member_id is not null
     and member_id <> v_uid
   limit 31
  on conflict do nothing;

  return v_conversation_id;
end;
$$;

grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

drop function if exists public.get_dm_conversations(uuid);
create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
returns table (
  id                  uuid,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_color  text,
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
