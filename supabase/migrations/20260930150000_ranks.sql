-- Ranks: a status tier earned by posting and by what other people do with it.
--
-- Status only (no reach, no unlocks), never drops, plus an "active this week"
-- marker. Approved design, 2026-09-30.
--
-- Points are DERIVED, never accumulated. rank_breakdowns() recomputes them from
-- posts, comments, likes and re-echoes every time, so a deleted post, an
-- un-like or a moderation takedown simply stops counting, and the weights can
-- change without migrating anything. The alternative (a ledger fed by
-- triggers) needs a reversal for every undo path, and one missed reversal
-- corrupts a total forever.
--
--   Publish a post ............................ 10   (3 posts a day count)
--   Co-author a post .......................... 10
--   Someone comments on your post .............  3   (once per person per post)
--   Someone re-echoes your post ...............  4   (once per person per post)
--   Someone likes your post ...................  1   (once per person per post)
--   You comment on someone else's post ........  2   (10 a day count)
--
-- Only posts that passed moderation (check_content) count, and nothing you do
-- to your own posts counts. Days are UTC.
--
-- Tiers: Newcomer 0 · Voice 10 · Regular 75 · Contributor 250 · Resonant 750 ·
-- Luminary 2000. lib/ranks.ts mirrors these; a test keeps the two in step.
--
-- Live vs stored: get_my_rank() computes the caller's own rank on demand, so a
-- new post moves the progress bar at once. refresh_ranks() stores everyone's
-- points, tier and last activity on profiles hourly, so the small tier mark
-- beside names costs nothing to read. Someone else's mark can lag by an hour.

-- ── tier thresholds ──────────────────────────────────────────────────────────
create or replace function public.rank_tier_for(p_points integer)
returns smallint
language sql
immutable
as $$
  select (case
    when p_points >= 2000 then 5
    when p_points >= 750  then 4
    when p_points >= 250  then 3
    when p_points >= 75   then 2
    when p_points >= 10   then 1
    else 0
  end)::smallint;
$$;

-- ── the one place points are computed ────────────────────────────────────────
-- p_uids null = everyone. Not callable by clients (see revokes below).
--
-- Reads public.public_echoes directly, not visible_echoes: visible_echoes
-- filters by auth.uid(), which is null in the hourly job, so private accounts
-- would never earn points. What leaves this function is per-person totals,
-- never a post, and only through refresh_ranks (tier) and get_my_rank (your
-- own). lib/feedRpcPrivacyGate.test.ts lists it as an allowed raw reader.
create or replace function public.rank_breakdowns(p_uids uuid[])
returns table (
  user_id uuid,
  post_pts integer,
  coauthor_pts integer,
  comments_received_pts integer,
  reposts_received_pts integer,
  likes_received_pts integer,
  comments_made_pts integer,
  last_active_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with posts as (
    select e.id, e.author_id, e.co_author_id, e.created_at
      from public.public_echoes e
     where e.check_content
  ),
  post_pts as (
    select author_id as uid, sum(least(n, 3))::int * 10 as pts
      from (select author_id, (created_at at time zone 'utc')::date, count(*) as n
              from posts
             where p_uids is null or author_id = any (p_uids)
             group by 1, 2) d
     group by 1
  ),
  coauthor_pts as (
    select co_author_id as uid, count(*)::int * 10 as pts
      from posts
     where co_author_id is not null
       and co_author_id <> author_id
       and (p_uids is null or co_author_id = any (p_uids))
     group by 1
  ),
  comments_received as (
    select p.author_id as uid, count(distinct (c.echo_id, c.author_id))::int * 3 as pts
      from public.echo_comments c
      join posts p on p.id = c.echo_id
     where c.author_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  reposts_received as (
    select p.author_id as uid, count(distinct (r.echo_id, r.user_id))::int * 4 as pts
      from public.echo_reposts r
      join posts p on p.id = r.echo_id
     where r.user_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  likes_received as (
    select p.author_id as uid, count(distinct (l.echo_id, l.user_id))::int * 1 as pts
      from public.echo_likes l
      join posts p on p.id = l.echo_id
     where l.user_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  comments_made as (
    select uid, sum(least(n, 10))::int * 2 as pts
      from (select c.author_id as uid, (c.created_at at time zone 'utc')::date, count(*) as n
              from public.echo_comments c
              join posts p on p.id = c.echo_id
             where c.author_id <> p.author_id
               and (p_uids is null or c.author_id = any (p_uids))
             group by 1, 2) d
     group by 1
  ),
  activity as (
    select uid, max(at) as last_active_at from (
      select author_id as uid, created_at as at from public.public_echoes
       where p_uids is null or author_id = any (p_uids)
      union all
      select author_id, created_at from public.echo_comments
       where p_uids is null or author_id = any (p_uids)
    ) a
    group by 1
  ),
  people as (
    select uid from post_pts union select uid from coauthor_pts
    union select uid from comments_received union select uid from reposts_received
    union select uid from likes_received union select uid from comments_made
    union select uid from activity
  )
  select pe.uid,
         coalesce(pp.pts, 0), coalesce(ca.pts, 0), coalesce(cr.pts, 0),
         coalesce(rr.pts, 0), coalesce(lr.pts, 0), coalesce(cm.pts, 0),
         ac.last_active_at
    from people pe
    left join post_pts pp          on pp.uid = pe.uid
    left join coauthor_pts ca      on ca.uid = pe.uid
    left join comments_received cr on cr.uid = pe.uid
    left join reposts_received rr  on rr.uid = pe.uid
    left join likes_received lr    on lr.uid = pe.uid
    left join comments_made cm     on cm.uid = pe.uid
    left join activity ac          on ac.uid = pe.uid;
$$;

-- ── stored copy on profiles (for marks beside names) ─────────────────────────
alter table public.profiles
  add column if not exists rank_points integer not null default 0,
  add column if not exists rank_tier smallint not null default 0,
  add column if not exists rank_active_at timestamptz;

comment on column public.profiles.rank_points is
  'Rank points, stored hourly by refresh_ranks() from rank_breakdowns(). Derived; never written by clients.';
comment on column public.profiles.rank_tier is
  '0 Newcomer … 5 Luminary (rank_tier_for). Stored hourly by refresh_ranks().';
comment on column public.profiles.rank_active_at is
  'Last post or comment, for the "active this week" marker. Stored hourly by refresh_ranks().';

-- Every new profiles column needs an explicit column grant (see the
-- 2026-08 grant migrations). Read-only: there is deliberately no UPDATE grant,
-- so nobody can write their own rank.
grant select (rank_points, rank_tier, rank_active_at) on public.profiles to anon, authenticated;

create or replace function public.refresh_ranks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  with b as (
    select user_id,
           (post_pts + coauthor_pts + comments_received_pts + reposts_received_pts
             + likes_received_pts + comments_made_pts) as points,
           last_active_at
      from public.rank_breakdowns(null)
  )
  update public.profiles pr
     set rank_points    = coalesce(b.points, 0),
         rank_tier      = public.rank_tier_for(coalesce(b.points, 0)),
         -- A private account's recent activity is not shown to people it has
         -- not approved, so it never gets the "active this week" marker. Its
         -- tier is an aggregate and does show, like its follower count.
         rank_active_at = case when p.is_private then null else b.last_active_at end
    from public.profiles p
    left join b on b.user_id = p.id
   where pr.id = p.id
     -- Only rows that moved, so an idle hour writes nothing.
     and (pr.rank_points    is distinct from coalesce(b.points, 0)
       or pr.rank_active_at is distinct from (case when p.is_private then null else b.last_active_at end));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- ── the caller's own rank, live ──────────────────────────────────────────────
-- No user-id parameter: it answers only about auth.uid().
create or replace function public.get_my_rank()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  b as (select * from public.rank_breakdowns(array[(select uid from me)]))
  select case when (select uid from me) is null then null else json_build_object(
    'points', coalesce((select post_pts + coauthor_pts + comments_received_pts + reposts_received_pts
                          + likes_received_pts + comments_made_pts from b), 0),
    'last_active_at', (select last_active_at from b),
    'breakdown', json_build_object(
      'posts',             coalesce((select post_pts from b), 0),
      'coauthor',          coalesce((select coauthor_pts from b), 0),
      'comments_received', coalesce((select comments_received_pts from b), 0),
      'reposts_received',  coalesce((select reposts_received_pts from b), 0),
      'likes_received',    coalesce((select likes_received_pts from b), 0),
      'comments_made',     coalesce((select comments_made_pts from b), 0)
    )
  ) end;
$$;

revoke execute on function public.rank_breakdowns(uuid[]) from public, anon, authenticated;
revoke execute on function public.refresh_ranks() from public, anon, authenticated;
revoke execute on function public.get_my_rank() from public, anon;
grant execute on function public.get_my_rank() to authenticated;

-- Fill the stored copy now, then hourly.
select public.refresh_ranks();
select cron.schedule('refresh-ranks', '7 * * * *', $cron$select public.refresh_ranks();$cron$);
