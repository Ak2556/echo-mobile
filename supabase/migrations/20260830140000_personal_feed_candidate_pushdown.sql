-- Final-review fixes for get_personal_feed: C1 (candidate push-down),
-- I1 (backfill/seen window alignment), I2 (backfill paging),
-- I3 (taste vector frozen for a scroll session).
--
-- C1 -- the shared `eligible` CTE was referenced by all four cand_* CTEs, so
-- Postgres materialised it once and every source became a `CTE Scan` + `Sort`
-- on top of a `Seq Scan on public_echoes`. Three consequences:
--   * cand_semantic could never use public_echoes_embedding_hnsw_idx, which is
--     the entire reason user_taste exists;
--   * cand_explore's inner `limit 500` bounded nothing, because it sat on a
--     full sort of the materialised CTE;
--   * `select e.*` materialised the 768-dim embedding for every eligible row
--     (~3 KB/row/request) -- invisible at 74 rows, multi-GB at 10M.
-- The shared CTE is gone. Each cand_* now selects only `id` straight from its
-- own driving relation, carrying only the cheap predicates that let it use its
-- index, and the expensive exclusions (blocked / muted / not-interested / seen
-- / self-authored) are applied ONCE after the union, against the <=350
-- candidate ids rather than the whole table. That turns four table-wide
-- anti-joins into a single pass over a few hundred rows.
--
-- cand_semantic keeps only `check_content = true and embedding is not null` in
-- its WHERE plus a pseudo-constant `v_taste is not null` guard (no Vars, so the
-- planner attaches it as a One-Time Filter above the scan rather than as a
-- per-row qual) -- the CTE therefore yields no rows at all when the user has no
-- taste vector, and the ORDER BY stays a bare `embedding <=> v_taste` that
-- pgvector can answer from the HNSW index.
--
-- cand_trending reads trending_echoes_mv alone (it has a global_score DESC
-- index); it does not touch public_echoes, so the "every read of public_echoes
-- filters check_content" invariant is satisfied by construction there, and the
-- post-union pass re-checks check_content for every candidate regardless.
--
-- I1 -- `seen` is bounded to 90 days but the backfill CTE had no bound on
-- v.created_at and ordered v.created_at asc, so it picked the OLDEST views
-- first: exactly the ones outside the 90-day seen window and therefore still
-- eligible as unseen. The same echo could appear in both tiers at two different
-- scores -- a duplicate card and a duplicate React key across pages. The
-- backfill is now bounded to the same 90-day window, so the two tiers are
-- strictly complementary.
--
-- I2 -- `limit p_limit` sat INSIDE the backfill CTE, before the outer cursor
-- filter, so page 2 recomputed the same oldest-viewed window and the cursor
-- removed everything already shown: no seen echo beyond that first window was
-- ever reachable. The inner limit is removed; the outer `limit p_limit * 3`
-- plus the keyset cursor do the paging. The inner `order by v.created_at asc`
-- goes with it -- it was only meaningful as the limit's sort key, and the
-- backfill rank_score is already a monotonically increasing function of
-- v.created_at, so the outer `order by rank_score desc` reproduces it exactly.
--
-- I3 -- the taste vector must be frozen for the lifetime of a cursor. The
-- function re-read it and could call refresh_user_taste on any page; crossing
-- the 6h staleness boundary mid-scroll re-scored every semantic candidate and
-- produced duplicates and skips. A refresh is now only ever considered when
-- p_cursor_score is null, i.e. on the first page of a scroll session.
--
-- Unchanged and re-verified: `set search_path = public, extensions` (pgvector
-- lives in extensions; a bare `public` fails at runtime with 42704);
-- p_user_id appears only in the signature and the v_uid assignment (IDOR);
-- candidates uses (array_agg(... order by case ...))[1], never min();
-- backfill scores stay strictly negative (-1/(1+d) is in (-1, 0) for d >= 0)
-- so they sort below every primary score; and the final ORDER BY is exactly
-- `rank_score desc, id desc`, matching the keyset cursor.

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
      join public.public_echoes e on e.author_id = f.following_id
     where f.follower_id = v_uid
       and e.check_content = true
       and e.author_id <> v_uid
     order by e.created_at desc
     limit 100
  ),
  cand_semantic as (
    select e.id, 'semantic'::text as source
      from public.public_echoes e
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
     limit 100
  ),
  cand_explore as (
    select el.id, 'exploration'::text as source
      from (
        select e.id, e.created_at
          from public.public_echoes e
         where e.check_content = true
         order by e.created_at desc
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
    -- The expensive exclusions run exactly once here, against the <=350
    -- candidate ids rather than the whole table (C1).
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
    join public.public_echoes e on e.id = v.echo_id
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
$$;

revoke all on function public.get_personal_feed(uuid, int, float8, uuid, int) from public, anon;
grant execute on function public.get_personal_feed(uuid, int, float8, uuid, int) to authenticated, service_role;
