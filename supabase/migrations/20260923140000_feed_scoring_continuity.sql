-- Feed curation: score every post, and stop one author owning the page.
--
-- Measured on production before this change, for a real account:
--   * 64 of 83 visible posts sit outside trending_echoes_mv's 30-day window.
--     get_ranked_feed multiplies by coalesce(mv.global_score, 0), so those 64
--     scored exactly 0 and were ordered by `id desc` — two thirds of the corpus
--     sorted by UUID.
--   * The page that came back held 20 rows from 8 authors, 9 of them by one
--     author. The per-author cap lives in lib/feedSelection.ts and only runs on
--     the personalized path, which is not reachable today (see note below).
--   * Every returned row scored at or below 0.03, so the ordering carried
--     almost no information.
--
-- Three changes, all server-side:
--
--   1. feed_base_score() computes the same engagement-over-age curve the
--      materialized view uses, so a post outside the window is ranked by the
--      same rule instead of falling to zero. The view now uses it too, so the
--      fresh path and the fallback path cannot drift apart.
--
--   2. A freshness floor. The old numerator was pure engagement, so a brand
--      new post with no likes scored 0 — invisible next to an older post with
--      one like. That barely shows today (2 such posts) and would dominate at
--      launch, when every post starts at zero. The floor is worth about half a
--      like and decays with the same curve, so new work gets a chance without
--      outranking things people actually engaged with.
--
--   3. Author dampening in get_ranked_feed: an author's second post scores
--      0.6x, the third 0.36x, and so on. The rank is computed over that
--      author's own posts, never over the page, so it is identical on page 1
--      and page 5 and keyset pagination stays correct.
--
-- Note, not fixed here because it needs an app build: get_personal_feed falls
-- back to get_ranked_feed unless can_be_profiled() is true, which requires a
-- known adult age, and 0 of 47 profiles have a date of birth. So every user is
-- on this path today, which is why it was worth fixing first.

begin;

-- ── 1. one scoring rule ─────────────────────────────────────────────────────
create or replace function public.feed_base_score(
  p_likes      integer,
  p_comments   integer,
  p_reposts    integer,
  p_views      integer,
  p_created_at timestamptz,
  p_has_media  boolean
)
returns double precision
language sql
stable
parallel safe
set search_path = public
as $$
  select (
    -- Engagement, weighted by how much each signal costs the person giving it,
    -- plus a floor so an unengaged new post still has a score to decay.
    ((coalesce(p_likes, 0) * 3.0
      + coalesce(p_comments, 0) * 5.0
      + coalesce(p_reposts, 0) * 4.0
      + coalesce(p_views, 0) * 0.3
      + 1.5)
     / power(greatest(extract(epoch from now() - p_created_at) / 3600.0, 0.1) + 2.0, 1.8))
    -- Engagement rate: ten likes from twenty readers beats ten from a thousand.
    * (1.0 + (coalesce(p_likes, 0) + coalesce(p_comments, 0) + coalesce(p_reposts, 0))::float8
             / greatest(coalesce(p_views, 0), 1)::float8 * 2.0)
    * case when coalesce(p_has_media, false) then 1.2 else 1.0 end
  )::double precision;
$$;

comment on function public.feed_base_score(integer, integer, integer, integer, timestamptz, boolean) is
  'The one engagement-over-age curve the feed ranks by. Used by trending_echoes_mv and, for posts outside its window, directly by the feed RPCs.';

revoke all on function public.feed_base_score(integer, integer, integer, integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.feed_base_score(integer, integer, integer, integer, timestamptz, boolean) to authenticated, anon;

-- ── 2. the view uses the same rule ──────────────────────────────────────────
drop materialized view if exists public.trending_echoes_mv cascade;
create materialized view public.trending_echoes_mv as
  select
    e.id,
    e.author_id,
    e.created_at,
    public.feed_base_score(
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls is not null and array_length(e.media_urls, 1) > 0
    ) as global_score
  from public.public_echoes e
  where e.created_at > now() - interval '30 days';

create unique index if not exists trending_echoes_mv_id_idx on public.trending_echoes_mv (id);
create index if not exists trending_echoes_mv_score_idx on public.trending_echoes_mv (global_score desc);

-- Restated from 20260830070200_lock_down_trending_mv: the cascade above drops
-- the grants with the view, and a readable trending view leaks hidden posts.
revoke all on public.trending_echoes_mv from anon, authenticated;

-- ── 3. continuity and author dampening in the ranked feed ───────────────────
create or replace function public.get_ranked_feed(
  p_user_id        uuid    default null,
  p_limit          int     default 20,
  p_gravity        float8  default 1.8,
  p_cursor_score   float8  default null,
  p_cursor_id      uuid    default null,
  p_following_only boolean default false
)
returns table(id uuid, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, view_count integer, created_at timestamp with time zone, media_urls text[], quoted_echo_id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, rank_score double precision)
language sql
stable security definer
set search_path to 'public'
as $function$
  WITH caller AS (
    SELECT CASE
             WHEN coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               THEN p_user_id
             WHEN p_user_id IS NULL THEN NULL
             ELSE auth.uid()
           END AS uid
  ),
  eligible AS (
    SELECT
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      -- Outside the view's window the score is computed rather than zeroed, so
      -- the whole corpus stays on one curve instead of tying at 0 and sorting
      -- by uuid.
      COALESCE(mv.global_score, public.feed_base_score(
        e.likes_count, e.comment_count, e.repost_count, e.view_count,
        e.created_at, e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0
      )) AS base_score,
      c.uid AS viewer,
      EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = c.uid AND f.following_id = e.author_id
      ) AS follows_author
    FROM public.visible_echoes e
    CROSS JOIN caller c
    JOIN public.profiles p ON p.id = e.author_id
    LEFT JOIN public.trending_echoes_mv mv ON mv.id = e.id
    WHERE
      e.check_content = true
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = c.uid AND b.blocked_id = e.author_id
      ))
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_mutes m
        WHERE m.muter_id = c.uid AND m.muted_id = e.author_id
      ))
      AND (
        NOT p_following_only
        OR c.uid IS NULL
        OR EXISTS (
          SELECT 1 FROM public.follows f2
          WHERE f2.follower_id = c.uid AND (
            f2.following_id = e.author_id
            OR EXISTS (
              SELECT 1 FROM public.echo_reposts r
              WHERE r.echo_id = e.id AND r.user_id = f2.following_id
            )
          )
        )
      )
  ),
  ranked_within_author AS (
    -- Rank each author's posts among their own for that day, never within the
    -- page, so the rules below are identical on every page and the keyset
    -- cursor holds. Per day rather than overall: a prolific author keeps their
    -- best three of each day instead of being limited to three for ever.
    SELECT eg.*,
           row_number() OVER (
             PARTITION BY eg.author_id, date_trunc('day', eg.created_at)
             ORDER BY eg.base_score DESC, eg.id DESC
           ) AS author_rank
    FROM eligible eg
  ),
  scored AS (
    SELECT
      r.id, r.author_id, r.title, r.prompt, r.response,
      r.likes_count, r.comment_count, r.repost_count, r.view_count,
      r.created_at, r.media_urls, r.quoted_echo_id,
      r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
      r.is_verified, r.follower_count, r.author_rank,
      (
        r.base_score
        * (1.0 + log(greatest(r.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * CASE WHEN r.viewer IS NOT NULL AND r.follows_author THEN 1.5 ELSE 1.0 END
        -- One author's second post of the day counts 0.6 and the third 0.36,
        -- so a good run still gets a run.
        * power(0.6::float8, least(r.author_rank - 1, 2)::float8)
      ) AS rank_score
    FROM ranked_within_author r
  )
  SELECT
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  FROM scored s
  WHERE
    -- At most three posts per author per day. Dampening alone could not hold
    -- the line: measured on production, one author with the only fresh posts
    -- still took five of the top ten, because a 0.6 curve cannot close a gap
    -- of two orders of magnitude. Lifted for the following-only feed, where
    -- seeing one person's whole day is the point.
    (p_following_only OR s.author_rank <= 3)
    AND (
    p_cursor_score IS NULL
    OR s.rank_score < p_cursor_score
    OR (s.rank_score = p_cursor_score AND s.id < p_cursor_id)
    )
  ORDER BY s.rank_score DESC, s.id DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

-- ── 4. the personalized path gets the same continuity ───────────────────────
-- Re-emitted from the live definition with one change: the 0.01 floor for
-- posts outside the view's window becomes the same computed score, so a
-- semantically perfect older post is ranked rather than pinned to the floor.
-- Everything else — candidate sources, seen-exclusion, the backfill tier, the
-- profiling gate — is unchanged.
CREATE OR REPLACE FUNCTION public.get_personal_feed(p_user_id uuid, p_limit integer DEFAULT 20, p_cursor_score double precision DEFAULT NULL::double precision, p_cursor_id uuid DEFAULT NULL::uuid, p_session_seed integer DEFAULT 0)
 RETURNS TABLE(id uuid, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, view_count integer, created_at timestamp with time zone, media_urls text[], quoted_echo_id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, rank_score double precision, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid                uuid;
  v_taste              extensions.vector(768);
  v_updated            timestamptz;
  v_cand_trend_limit   int;
  v_cand_explore_limit int;
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

  -- Lazy taste refresh: cost scales with DAU, not registered users. The
  -- refresh is gated on p_cursor_score being null (I3) so the vector stays
  -- frozen for the lifetime of a cursor -- a refresh mid-scroll would re-score
  -- every semantic candidate and break keyset pagination.
  select ut.taste_vector, ut.updated_at into v_taste, v_updated
    from public.user_taste ut where ut.user_id = v_uid;

  if p_cursor_score is null
     and (v_updated is null or v_updated < now() - interval '6 hours') then
    perform public.refresh_user_taste(v_uid);
    select ut.taste_vector into v_taste
      from public.user_taste ut where ut.user_id = v_uid;
  end if;

  -- M1(a): cold-start candidate mix shift. A null taste vector means
  -- cand_semantic already yields nothing, so widen trending and exploration
  -- to fill the gap; follow stays at its standard limit either way.
  v_cand_trend_limit   := case when v_taste is null then 150 else 100 end;
  v_cand_explore_limit := case when v_taste is null then 100 else 50 end;

  return query
  with seen as (
    select v.echo_id from public.echo_views v
     where v.user_id = v_uid
       and v.created_at > now() - interval '90 days'
  ),
  -- Candidate generation (C1): each source is index-driven and bounded, and
  -- carries only the predicates it needs to stay on its index. Nothing here
  -- reads more than `id` (plus its own sort key) from public_echoes.
  cand_follow as (
    select e.id, 'follow'::text as source
      from public.follows f
      join public.visible_echoes e on e.author_id = f.following_id
     where f.follower_id = v_uid
       and e.check_content = true
       and e.author_id <> v_uid
     order by e.created_at desc
     limit 100
  ),
  cand_semantic as (
    select e.id, 'semantic'::text as source
      from public.visible_echoes e
     where v_taste is not null
       and e.check_content = true
       and e.embedding is not null
     order by e.embedding <=> v_taste
     limit 100
  ),
  cand_trending as (
    select mv.id, 'trending'::text as source
      from public.trending_echoes_mv mv
     order by mv.global_score desc
     limit v_cand_trend_limit
  ),
  cand_explore as (
    select el.id, 'exploration'::text as source
      from (
        select e.id, e.created_at
          from public.visible_echoes e
         where e.check_content = true
         order by e.created_at desc
         limit 500
      ) el
     order by md5(el.id::text || p_session_seed::text)
     limit v_cand_explore_limit
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
    -- The expensive exclusions run exactly once here, against the <=350+
    -- candidate ids rather than the whole table (C1).
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (
        coalesce(mv.global_score, public.feed_base_score(
            e.likes_count, e.comment_count, e.repost_count, e.view_count,
            e.created_at, e.media_urls is not null and array_length(e.media_urls, 1) > 0
          ))
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
    join public.visible_echoes e on e.id = c.id
    join public.profiles p on p.id = e.author_id
    left join public.trending_echoes_mv mv on mv.id = e.id
    -- M2: author_affinity now counts past likes AND comments the viewer made
    -- on this author's content, unioned before the count. Both legs still
    -- join back through public_echoes (le) to assert check_content = true on
    -- the echo being liked/commented on.
    left join lateral (
      select count(*)::float8 as interactions
        from (
          select l.echo_id from public.echo_likes l where l.user_id = v_uid
          union all
          select c2.echo_id from public.echo_comments c2 where c2.author_id = v_uid
        ) act
        join public.visible_echoes le on le.id = act.echo_id
       where le.author_id = e.author_id
         and le.check_content = true
    ) aff on true
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
  -- Bounded to the same 90-day window as `seen` (I1) so the two tiers cannot
  -- both contain the same echo, and unbounded in row count (I2) so the outer
  -- cursor can page through it.
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
    join public.visible_echoes e on e.id = v.echo_id
    join public.profiles p on p.id = e.author_id
    where v.user_id = v_uid
      and v.created_at > now() - interval '90 days'
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = v_uid and b.blocked_id = e.author_id)
      and not exists (select 1 from public.user_mutes m
                       where m.muter_id = v_uid and m.muted_id = e.author_id)
      and not exists (select 1 from public.user_not_interested ni
                       where ni.user_id = v_uid
                         and (ni.echo_id = e.id or ni.author_id = e.author_id))
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
$function$;

commit;
