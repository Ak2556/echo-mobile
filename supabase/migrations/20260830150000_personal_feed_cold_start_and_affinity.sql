-- Second fix wave, M1(a) + M2 on get_personal_feed.
--
-- M1(a) -- cold start candidate mix shift. Below ~3 likes there is no
-- meaningful taste vector (refresh_user_taste's avg(embedding) over 0-2 rows
-- is either null or noise), so v_taste is null and cand_semantic already
-- contributes zero rows (its `v_taste is not null` guard). Left alone, the
-- pool for a cold user is just cand_follow (<=100) + cand_trending (<=100) +
-- cand_explore (<=50), which under-serves exactly the users who have the
-- least follow graph and the least taste signal to lean on. When v_taste is
-- null, cand_trending's limit rises 100 -> 150 and cand_explore's rises
-- 50 -> 100; cand_follow is deliberately left at 100, since a cold user's
-- follow graph is a hard signal (they chose those authors) that widening
-- would not improve, and semantic stays at zero by construction. This
-- shifts the candidate pool's composition toward trending/exploration for
-- cold users without changing anything for users who already have a taste
-- vector (v_trend_limit/v_explore_limit both resolve to the previous
-- constants in that case, byte-identical output to 20260830140000).
--
-- M2 -- author_affinity (the `aff` lateral feeding rank_score) counted only
-- echo_likes; the design spec calls for "past likes and comments on that
-- author". Widened to union echo_likes and echo_comments by the viewer,
-- joined back through public_echoes so both still assert check_content =
-- true (the joined echo is what is being liked/commented on, and that read
-- of public_echoes must be gated same as every other). Saturation (the /5.0
-- in the scored CTE, unchanged) still caps the boost at 5 combined
-- interactions.
--
-- Everything else -- v_uid identity resolution, the source-priority
-- array_agg, the C1 candidate push-down, the I1/I2/I3 backfill fixes -- is
-- byte-identical to 20260830140000.

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
     limit v_cand_trend_limit
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
        join public.public_echoes le on le.id = act.echo_id
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
