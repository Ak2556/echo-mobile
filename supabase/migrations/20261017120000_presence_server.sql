-- Presence, server side. See docs/superpowers/specs/2026-10-16-presence-design.md.
create unlogged table if not exists public.user_presence (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;

create or replace function public.ping_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  if not exists (select 1 from public.profiles p where p.id = me and (p.online_status or p.activity_status)) then
    delete from public.user_presence where user_id = me;
    return;
  end if;
  insert into public.user_presence as up (user_id, last_seen_at)
  values (me, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
   where up.last_seen_at < now() - interval '20 seconds';
end;
$$;
revoke all on function public.ping_presence() from public, anon;
grant execute on function public.ping_presence() to authenticated;

create or replace function public.get_presence(p_user_ids uuid[])
returns table(user_id uuid, online boolean, last_active text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.online_status, p.activity_status from public.profiles p where p.id = auth.uid()
  ),
  asked as (
    select distinct u.id from unnest(p_user_ids[1:50]) as u(id) where u.id is not null
  ),
  seen as (
    select a.id as uid,
           coalesce(
             me.id is not null
             and exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = a.id)
             and exists (select 1 from public.follows f where f.follower_id = a.id and f.following_id = me.id)
             and not exists (select 1 from public.user_blocks b
                              where (b.blocker_id = me.id and b.blocked_id = a.id)
                                 or (b.blocker_id = a.id and b.blocked_id = me.id)),
             false) as visible,
           t.online_status as t_online, t.activity_status as t_activity,
           me.online_status as m_online, me.activity_status as m_activity,
           up.last_seen_at
      from asked a
      left join me on true
      left join public.profiles t on t.id = a.id
      left join public.user_presence up on up.user_id = a.id
  ),
  calc as (
    select s.*,
           (s.visible and coalesce(s.t_online, false) and coalesce(s.m_online, false)
            and s.last_seen_at is not null and s.last_seen_at > now() - interval '90 seconds') as is_online
      from seen s
  )
  select c.uid, c.is_online,
         case when c.visible and not c.is_online and coalesce(c.t_activity, false) and coalesce(c.m_activity, false)
                   and c.last_seen_at is not null
              then case when now() - c.last_seen_at < interval '1 hour'   then 'recent'
                        when now() - c.last_seen_at < interval '24 hours' then 'today'
                        when now() - c.last_seen_at < interval '48 hours' then 'yesterday'
                        when now() - c.last_seen_at < interval '7 days'   then 'this_week'
                   end
         end
    from calc c;
$$;
revoke all on function public.get_presence(uuid[]) from public, anon;
grant execute on function public.get_presence(uuid[]) to authenticated;
