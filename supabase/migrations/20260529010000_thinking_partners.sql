-- Thinking-partner matching.
--
-- Echo already stores a 768-d embedding on every moderated echo (set by the
-- embed-echo edge function). This RPC turns those embeddings into a social
-- discovery surface that a generic feed app can't replicate:
--
--   * It builds a per-user "thinking centroid" = the average embedding of all
--     that user's moderated echoes — a vector summary of what/how they think.
--   * It compares the viewer's centroid to everyone else's via cosine
--     similarity and returns either the NEAREST thinkers ("people who think
--     like you") or the FARTHEST ("people who think very differently").
--
-- Mode 'similar' surfaces kindred minds; mode 'different' surfaces productive
-- friction. Both exclude self, blocked, muted, and already-followed users.
--
-- Note on cost: centroids are averaged on the fly each call. That's fine at
-- v1 scale; if the author/echo counts grow large, precompute centroids into a
-- materialized table refreshed by embed-echo.

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
set search_path = public
as $$
  with viewer as (
    select avg(e.embedding)::vector(768) as centroid
    from public.public_echoes e
    where e.author_id = p_user_id
      and e.embedding is not null
      and e.check_content = true
  ),
  candidates as (
    select
      e.author_id,
      avg(e.embedding)::vector(768) as centroid,
      count(*)::int                 as echo_count
    from public.public_echoes e
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
  -- 'similar' → smallest distance first; 'different' → largest distance first.
  order by (c.centroid <=> v.centroid) * (case when p_mode = 'different' then -1 else 1 end) asc
  limit p_limit;
$$;
