-- Close an RLS bypass in every feed RPC.
--
-- public.public_echoes carries an RLS policy whose entire purpose is hiding
-- private accounts' echoes from non-followers (20260809100000_harden_rls):
--
--     auth.uid() = author_id
--     OR profiles.is_private = false
--     OR the caller follows the author
--
-- Every feed RPC is SECURITY DEFINER, and a definer function does not run
-- under RLS. Each one therefore had to re-implement that gate itself, and not
-- one of them did — get_ranked_feed even joins public.profiles already, with
-- is_private sitting in scope, unused. The result: any caller could read
-- echoes authored by private accounts they do not follow. Three of these
-- functions are granted to `anon`, and the anon key ships inside the app
-- bundle, so no account was required at all.
--
-- The fix is one predicate and one view rather than seven hand-edited WHERE
-- clauses. Each function body below is its previous definition verbatim with a
-- single identifier changed, public_echoes -> visible_echoes, which cannot
-- disturb an alias or a clause boundary the way clause surgery could.
--
-- auth.uid() is the load-bearing detail: it reads request.jwt.claims, which is
-- request-scoped rather than role-scoped, so it still identifies the end user
-- inside a SECURITY DEFINER function. assert_group_admin already relies on
-- this.

-- ── the gate, stated once ───────────────────────────────────────────────────
create or replace function public.can_view_echo_author(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  -- Mirrors the RLS policy on public_echoes exactly. If that policy changes,
  -- this must change with it.
  select
    auth.uid() = p_author_id
    or exists (
      select 1 from public.profiles p
      where p.id = p_author_id and p.is_private = false
    )
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p_author_id
    );
$fn$;

comment on function public.can_view_echo_author(uuid) is
  'Whether the calling user may see echoes by this author. Mirrors the RLS policy on public_echoes, for SECURITY DEFINER functions that bypass it.';

revoke all on function public.can_view_echo_author(uuid) from public;
grant execute on function public.can_view_echo_author(uuid) to anon, authenticated, service_role;

-- ── the same table, minus what the caller may not see ───────────────────────
-- A plain view: it runs with the view owner's privileges, so RLS on the
-- underlying table stays bypassed and the predicate above does the work. That
-- is deliberate — security_invoker would resolve to the *function owner*
-- inside a definer function, not the end user, and would gate nothing.
create or replace view public.visible_echoes as
  select e.* from public.public_echoes e
  where public.can_view_echo_author(e.author_id);

comment on view public.visible_echoes is
  'public_echoes filtered by can_view_echo_author. Feed RPCs read this instead of the table so a definer function cannot leak private accounts.';

grant select on public.visible_echoes to anon, authenticated, service_role;


-- ── get_ranked_feed: 1 reference repointed ──────────────────────────
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
  WITH scored AS (
    SELECT
      e.id,
      e.author_id,
      e.title,
      e.prompt,
      e.response,
      e.likes_count,
      e.comment_count,
      e.repost_count,
      e.view_count,
      e.created_at,
      e.media_urls,
      e.quoted_echo_id,
      p.username,
      p.display_name,
      p.bio,
      p.avatar_color,
      p.avatar_url,
      p.is_verified,
      p.follower_count,
      -- Use the materialized global score, and just add the cheap personalized follower boost
      (
        COALESCE(mv.global_score, 0)
        * (1.0 + log(greatest(p.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * CASE
            WHEN p_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.follows f
              WHERE f.follower_id = p_user_id AND f.following_id = e.author_id
            ) THEN 1.5 ELSE 1.0
          END
      ) AS rank_score
    FROM public.visible_echoes e
    JOIN public.profiles p ON p.id = e.author_id
    LEFT JOIN public.trending_echoes_mv mv ON mv.id = e.id
    WHERE
      -- moderation gate: only surface content that has passed moderation
      e.check_content = true
      -- Block/mute filters
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = p_user_id AND b.blocked_id = e.author_id
      ))
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_mutes m
        WHERE m.muter_id = p_user_id AND m.muted_id = e.author_id
      ))
      -- Following-only scope
      AND (
        NOT p_following_only
        OR p_user_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.follows f2
          WHERE f2.follower_id = p_user_id AND (
            f2.following_id = e.author_id
            OR EXISTS (
              SELECT 1 FROM public.echo_reposts r
              WHERE r.echo_id = e.id AND r.user_id = f2.following_id
            )
          )
        )
      )
  )
  SELECT
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  FROM scored s
  WHERE
    -- Keyset pagination
    p_cursor_score IS NULL
    OR s.rank_score < p_cursor_score
    OR (s.rank_score = p_cursor_score AND s.id < p_cursor_id)
  ORDER BY s.rank_score DESC, s.id DESC
  LIMIT p_limit;
$function$;

-- ── get_personal_feed: 6 references repointed ──────────────────────────
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
$$;

-- ── get_semantic_feed: 5 references repointed ──────────────────────────
create or replace function public.get_semantic_feed(p_user_id uuid, p_limit integer default 20)
returns table(id uuid, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, view_count integer, remix_count integer, created_at timestamp with time zone, media_urls text[], quoted_echo_id uuid, parent_echo_id uuid, remix_root_id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, distance double precision)
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  taste vector(768);
  v_uid uuid;
begin
  -- Identity comes from the JWT, never from the parameter. service_role has no
  -- auth.uid(), so it alone may name a user explicitly.
  v_uid := case
    when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      then coalesce(p_user_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    return;
  end if;

  -- Average the embeddings of the user's recent likes (subquery to allow ORDER + LIMIT).
  select avg(recent_likes.embedding)::vector(768)
    into taste
    from (
      select e.embedding
      from public.echo_likes l
      join public.visible_echoes e on e.id = l.echo_id
      where l.user_id = v_uid
        and e.embedding is not null
        and e.check_content = true
      order by l.created_at desc
      limit 20
    ) recent_likes;

  -- Fall back to recent views / own publishes if no liked embeddings yet.
  if taste is null then
    select avg(recent_activity.embedding)::vector(768)
      into taste
      from (
        select e.embedding
        from (
          -- Qualify created_at with table alias to avoid clash with the
          -- plpgsql OUT variable of the same name (PG error 42702).
          select ev.echo_id, ev.created_at
          from public.echo_views ev
          where ev.user_id = v_uid

          union all

          select pe.id as echo_id, pe.created_at
          from public.visible_echoes pe
          where pe.author_id = v_uid
        ) src
        join public.visible_echoes e on e.id = src.echo_id
        where e.embedding is not null
          and e.check_content = true
        order by src.created_at desc
        limit 20
      ) recent_activity;
  end if;

  -- No signal at all -> degrade gracefully to engagement-ranked recent echoes.
  if taste is null then
    return query
      select
        e.id, e.author_id, e.title, e.prompt, e.response,
        e.likes_count, e.comment_count, e.repost_count, e.view_count,
        e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
        e.parent_echo_id, e.remix_root_id,
        p.username, p.display_name, p.bio,
        p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
        1.0::float8 as distance
      from public.visible_echoes e
      join public.profiles p on p.id = e.author_id
      where e.check_content = true
        and e.author_id <> v_uid
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = v_uid and b.blocked_id = e.author_id
        )
        and not exists (
          select 1 from public.user_mutes m
          where m.muter_id = v_uid and m.muted_id = e.author_id
        )
      order by (e.likes_count + e.comment_count * 2 + e.repost_count * 2) desc,
               e.created_at desc
      limit p_limit;
    return;
  end if;

  -- Main path: cosine-distance ranking against the taste vector.
  return query
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
      e.parent_echo_id, e.remix_root_id,
      p.username, p.display_name, p.bio,
      p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
      (e.embedding <=> taste)::float8 as distance
    from public.visible_echoes e
    join public.profiles p on p.id = e.author_id
    where e.embedding is not null
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = v_uid and b.blocked_id = e.author_id
      )
      and not exists (
        select 1 from public.user_mutes m
        where m.muter_id = v_uid and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$function$;

-- ── get_similar_echoes: 2 references repointed ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_similar_echoes(
  p_echo_id uuid,
  p_limit   int DEFAULT 8
)
RETURNS TABLE (
  id             uuid,
  author_id      uuid,
  title          text,
  prompt         text,
  response       text,
  likes_count    int,
  comment_count  int,
  repost_count   int,
  view_count     int,
  remix_count    int,
  created_at     timestamptz,
  media_urls     text[],
  parent_echo_id uuid,
  remix_root_id  uuid,
  username       text,
  display_name   text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  distance       float8
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH anchor AS (
    SELECT embedding FROM public.visible_echoes WHERE id = p_echo_id AND check_content = true
  )
  SELECT
    e.id, e.author_id, e.title, e.prompt, e.response,
    e.likes_count, e.comment_count, e.repost_count, e.view_count,
    e.remix_count, e.created_at, e.media_urls,
    e.parent_echo_id, e.remix_root_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    (e.embedding <=> (SELECT embedding FROM anchor))::float8 AS distance
  FROM public.visible_echoes e
  JOIN public.profiles p ON p.id = e.author_id
  WHERE e.id <> p_echo_id
    AND e.check_content = true
    AND e.embedding IS NOT NULL
    AND (SELECT embedding FROM anchor) IS NOT NULL
  ORDER BY e.embedding <=> (SELECT embedding FROM anchor) ASC
  LIMIT p_limit;
$$;

-- ── get_trending_evolutions: 2 references repointed ──────────────────────────
create or replace function public.get_trending_evolutions(
  p_limit int default 20
)
returns table (
  root_id           uuid,
  root_title        text,
  root_prompt       text,
  root_response     text,
  root_created_at   timestamptz,
  root_media_urls   text[],
  root_author_id    uuid,
  root_username     text,
  root_display_name text,
  root_avatar_color text,
  root_avatar_url   text,
  root_is_verified  bool,
  branch_count      int,
  agree_count       int,
  challenge_count   int,
  reframe_count     int,
  story_count       int,
  evidence_count    int,
  question_count    int,
  unique_authors    int,
  tree_engagement   bigint,
  newest_remix_at   timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with tree as (
    select
      coalesce(remix_root_id, id) as root_id,
      author_id,
      likes_count + comment_count * 2 + repost_count * 2 as eng,
      created_at,
      parent_echo_id,
      coalesce(perspective_type, 'reframe') as perspective_type
    from public.visible_echoes
    where check_content = true
  ),
  agg as (
    select
      root_id,
      count(*) filter (where parent_echo_id is not null) as branch_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'agree') as agree_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'challenge') as challenge_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'reframe') as reframe_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'story') as story_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'evidence') as evidence_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'question') as question_count,
      count(distinct author_id) as unique_authors,
      sum(eng)::bigint as tree_engagement,
      max(case when parent_echo_id is not null then created_at end) as newest_remix_at
    from tree
    group by root_id
    having count(*) filter (where parent_echo_id is not null) >= 1
  )
  select
    a.root_id,
    r.title, r.prompt, r.response, r.created_at, r.media_urls, r.author_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    a.branch_count::int,
    a.agree_count::int,
    a.challenge_count::int,
    a.reframe_count::int,
    a.story_count::int,
    a.evidence_count::int,
    a.question_count::int,
    a.unique_authors::int,
    a.tree_engagement,
    a.newest_remix_at
  from agg a
  join public.visible_echoes r on r.id = a.root_id and r.check_content = true
  join public.profiles p on p.id = r.author_id
  order by a.tree_engagement desc, a.newest_remix_at desc nulls last
  limit p_limit;
$$;

-- ── get_remix_tree: 2 references repointed ──────────────────────────
create or replace function public.get_remix_tree(
  p_root_id uuid
)
returns table (
  id               uuid,
  parent_echo_id   uuid,
  depth            int,
  author_id        uuid,
  title            text,
  prompt           text,
  response         text,
  likes_count      int,
  comment_count    int,
  repost_count     int,
  remix_count      int,
  perspective_type text,
  perspective_note text,
  source_url       text,
  created_at       timestamptz,
  media_urls       text[],
  username         text,
  display_name     text,
  avatar_color     text,
  avatar_url       text,
  is_verified      bool
)
language sql stable security definer
set search_path = public
as $$
  with recursive lineage as (
    select e.*, 0 as depth
      from public.visible_echoes e
     where e.id = p_root_id
       and e.check_content = true
    union all
    select e.*, l.depth + 1
      from public.visible_echoes e
      join lineage l on e.parent_echo_id = l.id
     where l.depth < 8
       and e.check_content = true
  )
  select
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    case when l.parent_echo_id is null then null else coalesce(l.perspective_type, 'reframe') end,
    l.perspective_note,
    l.source_url,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  from lineage l
  join public.profiles p on p.id = l.author_id
  order by l.depth asc,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) desc,
           l.created_at desc;
$$;

-- ── get_thinking_partners: 2 references repointed ──────────────────────────
create or replace function public.get_thinking_partners(
  p_user_id uuid,
  p_limit   int  default 12,
  p_mode    text default 'similar'   -- 'similar' | 'different'
)
returns table (
  id             uuid,
  username       text,
  display_name   text,
  bio            text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  follower_count int,
  echo_count     int,
  affinity       float8   -- cosine similarity in [-1, 1]; 1 = identical taste
)
language sql stable security definer
set search_path = public, extensions
as $$
  with viewer as (
    select avg(e.embedding)::vector(768) as centroid
    from public.visible_echoes e
    where e.author_id = p_user_id
      and e.embedding is not null
      and e.check_content = true
  ),
  candidates as (
    select
      e.author_id,
      avg(e.embedding)::vector(768) as centroid,
      count(*)::int                 as echo_count
    from public.visible_echoes e
    where e.author_id <> p_user_id
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
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = p_user_id and b.blocked_id = c.author_id
    )
    and not exists (
      select 1 from public.user_mutes m
      where m.muter_id = p_user_id and m.muted_id = c.author_id
    )
    and not exists (
      select 1 from public.follows f
      where f.follower_id = p_user_id and f.following_id = c.author_id
    )
  -- 'similar' -> smallest distance first; 'different' -> largest distance first.
  order by (c.centroid <=> v.centroid) * (case when p_mode = 'different' then -1 else 1 end) asc
  limit p_limit;
$$;
