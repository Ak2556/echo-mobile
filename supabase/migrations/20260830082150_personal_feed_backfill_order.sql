-- Task 5, fix round 1: correct keyset-pagination boundary loss and
-- inverted decay direction in the backfill tail added by
-- 20260830081129_personal_feed_diversity.sql.
--
-- Bug 1 (critical): the cursor predicate filtered on (rank_score, id) only,
-- while the final sort key was (tier, rank_score, id). Backfill rows use a
-- different rank_score formula than primary rows, so a backfill row could
-- score HIGHER than the last primary row on a page. Once the cursor was set
-- from that primary row's score S, every backfill row scoring >= S failed
-- `rank_score < S` and became unreachable for the rest of that scroll
-- session -- those echoes were permanently lost.
--
-- Bug 2 (important): the backfill decay
--   coalesce(mv.global_score, 0.01) / (1 + epoch(now() - created_at)/86400)
-- was largest when created_at (the *view* time, aliased v) was recent and
-- decayed toward 0 with age -- backwards from the intent of resurfacing
-- what the user has had time to forget.
--
-- Fix: backfill rank_score is now
--   -1.0 / (1 + extract(epoch from (now() - v.created_at)) / 86400.0)
-- which is always in the open interval (-1, 0). Primary rows always score
-- >= 0 (global_score is count-derived and non-negative, multiplied by an
-- affinity term >= 1), so every primary row now outranks every backfill
-- row by rank_score alone -- tier is no longer needed to separate them.
-- The final ORDER BY drops `tier` so the sort key is exactly the cursor
-- key (rank_score, id), closing the pagination bug. Direction is also now
-- correct: seen 10 days ago -> -1/11 ~= -0.09; seen a minute ago -> ~= -1.0;
-- sorted desc, long-ago-seen surfaces first. mv.global_score is no longer
-- used in the backfill branch, so its `left join trending_echoes_mv` is
-- dropped from that CTE only; the primary path's join is untouched. The
-- `tier` column itself is kept in both branches of the union so column
-- counts still align -- it is just no longer part of the ORDER BY.
--
-- Everything above the `scored` CTE, including the v_uid identity
-- resolution, the source-priority array_agg, and the bounded cand_explore,
-- is byte-identical to the previous migration (20260830081129). The
-- backfill CTE still uses v_uid (never p_user_id) to preserve the IDOR
-- fix: the parameter never drives identity anywhere in this function's
-- body.

create or replace function public.get_personal_feed(
  p_user_id      uuid,
  p_limit        int     default 20,
  p_cursor_score float8  default null,
  p_cursor_id    uuid    default null,
  p_session_seed int     default 0
)
returns table(
  id uuid, author_id uuid, title text, prompt text, response text,
  likes_count integer, comment_count integer, repost_count integer, view_count integer,
  created_at timestamptz, media_urls text[], quoted_echo_id uuid,
  username text, display_name text, bio text, avatar_color text, avatar_url text,
  is_verified boolean, follower_count integer,
  rank_score double precision, source text
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid;
  v_taste   extensions.vector(768);
  v_updated timestamptz;
begin
  -- Identity comes from the JWT, never from the parameter. The parameter is
  -- kept for signature compatibility and is advisory only; service_role may
  -- still pass an explicit id because it has no auth.uid() of its own.
  v_uid := case
    when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      then coalesce(p_user_id, auth.uid())
    else auth.uid()
  end;

  -- Stage 0: eligibility. A user who cannot be profiled never reaches the
  -- personalized path at all, so DSA compliance is structural.
  if v_uid is null or not public.can_be_profiled(v_uid) then
    return query
      select r.id, r.author_id, r.title, r.prompt, r.response,
             r.likes_count, r.comment_count, r.repost_count, r.view_count,
             r.created_at, r.media_urls, r.quoted_echo_id,
             r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
             r.is_verified, r.follower_count, r.rank_score, 'ranked'::text
        from public.get_ranked_feed(v_uid, p_limit, 1.8, p_cursor_score, p_cursor_id, false) r;
    return;
  end if;

  -- Lazy taste refresh: cost scales with DAU, not registered users.
  select ut.taste_vector, ut.updated_at into v_taste, v_updated
    from public.user_taste ut where ut.user_id = v_uid;

  if v_updated is null or v_updated < now() - interval '6 hours' then
    perform public.refresh_user_taste(v_uid);
    select ut.taste_vector into v_taste
      from public.user_taste ut where ut.user_id = v_uid;
  end if;

  return query
  with seen as (
    select v.echo_id from public.echo_views v
     where v.user_id = v_uid
       and v.created_at > now() - interval '90 days'
  ),
  eligible as (
    select e.*
      from public.public_echoes e
     where e.check_content = true
       and e.author_id <> v_uid
       and not exists (select 1 from public.user_blocks b
                        where b.blocker_id = v_uid and b.blocked_id = e.author_id)
       and not exists (select 1 from public.user_mutes m
                        where m.muter_id = v_uid and m.muted_id = e.author_id)
       and not exists (select 1 from public.user_not_interested ni
                        where ni.user_id = v_uid
                          and (ni.echo_id = e.id or ni.author_id = e.author_id))
       and not exists (select 1 from seen s where s.echo_id = e.id)
  ),
  cand_follow as (
    select el.id, 'follow'::text as source from eligible el
     where exists (select 1 from public.follows f
                    where f.follower_id = v_uid and f.following_id = el.author_id)
     order by el.created_at desc limit 100
  ),
  cand_semantic as (
    select el.id, 'semantic'::text as source from eligible el
     where v_taste is not null and el.embedding is not null
     order by el.embedding <=> v_taste asc limit 100
  ),
  cand_trending as (
    select el.id, 'trending'::text as source from eligible el
     join public.trending_echoes_mv mv on mv.id = el.id
     order by mv.global_score desc limit 100
  ),
  cand_explore as (
    select el.id, 'exploration'::text as source
      from (
        select el2.id, el2.created_at
          from eligible el2
         order by el2.created_at desc
         limit 500
      ) el
     order by md5(el.id::text || p_session_seed::text)
     limit 50
  ),
  candidates as (
    select c.id,
           (array_agg(c.source order by
              case c.source
                when 'follow'      then 1
                when 'semantic'    then 2
                when 'trending'    then 3
                else 4
              end))[1] as source
      from (
        select * from cand_follow    union all
        select * from cand_semantic  union all
        select * from cand_trending  union all
        select * from cand_explore
      ) c
     group by c.id
  ),
  scored as (
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (
        coalesce(mv.global_score, 0.01)
        * (
            1
            + 0.6 * greatest(0, 1 - coalesce(e.embedding <=> v_taste, 1))
            + 0.5 * (case when exists (
                select 1 from public.follows f
                 where f.follower_id = v_uid and f.following_id = e.author_id
              ) then 1 else 0 end)
            + 0.4 * least(coalesce(aff.interactions, 0) / 5.0, 1)
          )
      )::double precision as rank_score,
      c.source
    from candidates c
    join public.public_echoes e on e.id = c.id
    join public.profiles p on p.id = e.author_id
    left join public.trending_echoes_mv mv on mv.id = e.id
    left join lateral (
      select count(*)::float8 as interactions
        from public.echo_likes l
        join public.public_echoes le on le.id = l.echo_id
       where l.user_id = v_uid and le.author_id = e.author_id
         and le.check_content = true
    ) aff on true
  )
  , primary_pick as (
    -- Over-fetch: return more than the page so the client-side selector in
    -- lib/feedSelection.ts has room to apply the author cap and the
    -- exploration reserve. Those rules live in TypeScript because they are
    -- unit-tested there; SQL only ranks.
    select s.*, 0 as tier from scored s
  ),
  -- Backfill: with a small corpus, seen-exclusion empties the feed within days.
  -- Re-surface seen echoes ranked below every unseen one, decayed by how
  -- recently they were seen. An empty feed is a worse failure than a repeat.
  backfill as (
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (-1.0 / (1 + extract(epoch from (now() - v.created_at)) / 86400.0))::double precision as rank_score,
      'reseen'::text as source,
      1 as tier
    from public.echo_views v
    join public.public_echoes e on e.id = v.echo_id
    join public.profiles p on p.id = e.author_id
    where v.user_id = v_uid
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = v_uid and b.blocked_id = e.author_id)
      and not exists (select 1 from public.user_mutes m
                       where m.muter_id = v_uid and m.muted_id = e.author_id)
      and not exists (select 1 from public.user_not_interested ni
                       where ni.user_id = v_uid
                         and (ni.echo_id = e.id or ni.author_id = e.author_id))
    order by v.created_at asc
    limit p_limit
  ),
  merged as (
    select * from primary_pick
    union all
    select * from backfill
  )
  select m.id, m.author_id, m.title, m.prompt, m.response,
         m.likes_count, m.comment_count, m.repost_count, m.view_count,
         m.created_at, m.media_urls, m.quoted_echo_id,
         m.username, m.display_name, m.bio, m.avatar_color, m.avatar_url,
         m.is_verified, m.follower_count, m.rank_score, m.source
    from merged m
   where p_cursor_score is null
      or m.rank_score < p_cursor_score
      or (m.rank_score = p_cursor_score and m.id < p_cursor_id)
   order by m.rank_score desc, m.id desc
   limit p_limit * 3;
end;
$$;

revoke all on function public.get_personal_feed(uuid, int, float8, uuid, int) from public, anon;
grant execute on function public.get_personal_feed(uuid, int, float8, uuid, int) to authenticated, service_role;
