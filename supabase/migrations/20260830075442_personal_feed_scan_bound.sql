-- Fix round 2 on get_personal_feed (introduced 20260830074446, source
-- priority fixed 20260830074954):
--
-- 1. The author-affinity lateral joined public_echoes directly instead of
--    going through the eligible CTE, so it was the one read in this
--    function missing check_content = true. Nothing unmoderated reaches
--    the client from it (only a count feeds rank_score), but it violates
--    the project-wide rule that every read of public_echoes filters
--    check_content, and it let a viewer's likes on removed/violating
--    content inflate that author's affinity boost. Added
--    and le.check_content = true to its WHERE clause.
--
-- 2. cand_explore ordered by md5(id || seed) directly over the full
--    eligible set. md5() over a runtime seed cannot use any index, so
--    Postgres computed the hash for every eligible echo and sorted the
--    whole set on every call -- limit 50 caps the output, not the work.
--    Invisible at today's corpus size, but a per-request full scan in the
--    one stage that must stay index-bound at the 10M-row scale this
--    engine is being built for. Fixed by bounding the pool to the most
--    recent 500 eligible echoes first (served by the existing partial
--    index public_echoes_check_content_created_idx on
--    (created_at desc) where check_content = true), then hash-shuffling
--    only within those 500. Keeps per-session determinism (same seed,
--    same sample) and caps the sort at 500 rows regardless of corpus
--    size; exploration now samples recent content rather than the whole
--    archive, an intentional narrowing.
--
-- Everything else, including the v_uid identity resolution and the
-- source-priority array_agg, is unchanged from the previous migration.

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
  select s.id, s.author_id, s.title, s.prompt, s.response,
         s.likes_count, s.comment_count, s.repost_count, s.view_count,
         s.created_at, s.media_urls, s.quoted_echo_id,
         s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
         s.is_verified, s.follower_count, s.rank_score, s.source
    from scored s
   where p_cursor_score is null
      or s.rank_score < p_cursor_score
      or (s.rank_score = p_cursor_score and s.id < p_cursor_id)
   order by s.rank_score desc, s.id desc
   limit p_limit;
end;
$$;

revoke all on function public.get_personal_feed(uuid, int, float8, uuid, int) from public, anon;
grant execute on function public.get_personal_feed(uuid, int, float8, uuid, int) to authenticated, service_role;
