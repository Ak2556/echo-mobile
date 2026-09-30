-- Keep internal accounts out of people discovery.
--
-- The store reviewers' account (@review) exists so App Review and Play review
-- can sign in with a password. It was suggested to real users under "People
-- to start with", in the feed's follow card and in search (2026-09-30
-- release audit): fetchSuggestedUsers takes the most-followed profiles the
-- viewer does not follow, and with a small user base that is nearly everyone.
--
-- hidden_from_discovery removes a profile from suggestions, people search and
-- thinking partners. It does not hide the account's posts or block anyone
-- from opening its profile, and the account itself works normally.
-- Clients can read the flag (filters need SELECT) but not write it.

alter table public.profiles
  add column if not exists hidden_from_discovery boolean not null default false;

comment on column public.profiles.hidden_from_discovery is
  'Internal account (e.g. store reviewers): excluded from suggestions, people search and thinking partners. Not client-writable.';

-- Every profiles column needs an explicit column grant since the June hardening
-- (lib/profilesColumnGrants.test.ts); filtering on it needs SELECT too.
grant select (hidden_from_discovery) on public.profiles to authenticated;

update public.profiles set hidden_from_discovery = true where username = 'review';

-- Same function as live, plus the hidden_from_discovery exclusion.
create or replace function public.get_thinking_partners(p_user_id uuid, p_limit integer default 12, p_mode text default 'similar'::text)
 returns table(id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, echo_count integer, affinity double precision)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with caller as (
    select case
             when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               then p_user_id
             else auth.uid()
           end as uid
  ),
  viewer as (
    select avg(e.embedding)::vector(768) as centroid
    from public.visible_echoes e
    where e.author_id = (select uid from caller)
      and e.embedding is not null
      and e.check_content = true
  ),
  candidates as (
    select
      e.author_id,
      avg(e.embedding)::vector(768) as centroid,
      count(*)::int                 as echo_count
    from public.visible_echoes e
    where e.author_id <> (select uid from caller)
      and e.embedding is not null
      and e.check_content = true
    group by e.author_id
    having count(*) >= 2   -- need a couple of echoes for a meaningful centroid
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_color,
    p.avatar_url,
    p.is_verified,
    p.follower_count,
    c.echo_count,
    (1 - (c.centroid <=> v.centroid))::float8 as affinity
  from candidates c
  join viewer v on true
  join public.profiles p on p.id = c.author_id
  where v.centroid is not null
    and not p.hidden_from_discovery
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = (select uid from caller) and b.blocked_id = c.author_id
    )
    and not exists (
      select 1 from public.user_mutes m
      where m.muter_id = (select uid from caller) and m.muted_id = c.author_id
    )
    and not exists (
      select 1 from public.follows f
      where f.follower_id = (select uid from caller) and f.following_id = c.author_id
    )
  -- 'similar' -> smallest distance first; 'different' -> largest distance first.
  order by (c.centroid <=> v.centroid) * (case when p_mode = 'different' then -1 else 1 end) asc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$function$;
