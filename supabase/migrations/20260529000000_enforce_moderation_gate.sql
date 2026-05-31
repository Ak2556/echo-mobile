-- Enforce the moderation gate on the public feed.
--
-- Context: `public_echoes.check_content` (added in 20260525000000) was intended
-- as the read-time moderation gate, but the feed RPCs predate it and never
-- filtered on it, so unmoderated user content reached Discover. This migration:
--
--   1. Backfills every existing row to check_content = true so the gate doesn't
--      retroactively hide content that's already live. (Existing posts are
--      grandfathered as approved; new posts go through embed-echo moderation.)
--   2. Re-creates get_ranked_feed and get_semantic_feed with `check_content = true`
--      added to the rows they RETURN.
--
-- New rows default to check_content = false and are flipped to true by the
-- embed-echo edge function after moderation (fail-open). The chronological
-- fallback query is gated client-side in lib/supabaseEchoApi.ts.

-- ── 1. Backfill existing rows so they stay visible ───────────────────────────
update public.public_echoes
   set check_content = true
 where check_content is distinct from true;

-- ── 2a. get_ranked_feed — gated ──────────────────────────────────────────────
create or replace function public.get_ranked_feed(
  p_user_id        uuid    default null,
  p_limit          int     default 20,
  p_gravity        float8  default 1.8,
  p_cursor_score   float8  default null,
  p_cursor_id      uuid    default null,
  p_following_only boolean default false
)
returns table (
  id             uuid,
  author_id      uuid,
  title          text,
  prompt         text,
  response       text,
  likes_count    int,
  comment_count  int,
  repost_count   int,
  view_count     int,
  created_at     timestamptz,
  media_urls     text[],
  quoted_echo_id uuid,
  username       text,
  display_name   text,
  bio            text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  follower_count int,
  rank_score     float8
)
language sql stable security definer
set search_path = public
as $$
  with scored as (
    select
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
      (
        (e.likes_count * 3.0 + e.comment_count * 5.0 + e.repost_count * 4.0 + e.view_count * 0.3)
        / power(
            greatest(extract(epoch from (now() - e.created_at)) / 3600.0, 0.1) + 2.0,
            p_gravity
          )
        * (1.0 + (e.likes_count + e.comment_count + e.repost_count)::float8
               / greatest(e.view_count, 1) * 2.0)
        * (1.0 + log(greatest(p.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * case
            when e.media_urls is not null and array_length(e.media_urls, 1) > 0
            then 1.2 else 1.0
          end
        * case
            when p_user_id is not null and exists (
              select 1 from public.follows f
              where f.follower_id = p_user_id and f.following_id = e.author_id
            ) then 1.5 else 1.0
          end
      ) as rank_score
    from public.public_echoes e
    join public.profiles p on p.id = e.author_id
    where
      -- moderation gate: only surface content that has passed moderation
      e.check_content = true
      -- block / mute filters
      and (p_user_id is null or not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = p_user_id and b.blocked_id = e.author_id
      ))
      and (p_user_id is null or not exists (
        select 1 from public.user_mutes m
        where m.muter_id = p_user_id and m.muted_id = e.author_id
      ))
      -- following-only scope
      and (
        not p_following_only
        or p_user_id is null
        or exists (
          select 1 from public.follows f2
          where f2.follower_id = p_user_id and f2.following_id = e.author_id
        )
      )
  )
  select
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  from scored s
  where
    -- keyset pagination: continue after (score DESC, id DESC) cursor
    p_cursor_score is null
    or s.rank_score < p_cursor_score
    or (s.rank_score = p_cursor_score and s.id < p_cursor_id)
  order by s.rank_score desc, s.id desc
  limit p_limit;
$$;

-- ── 2b. get_semantic_feed — gated ────────────────────────────────────────────
create or replace function public.get_semantic_feed(
  p_user_id uuid,
  p_limit   int default 20
)
returns table (
  id              uuid,
  author_id       uuid,
  title           text,
  prompt          text,
  response        text,
  likes_count     int,
  comment_count   int,
  repost_count    int,
  view_count      int,
  remix_count     int,
  created_at      timestamptz,
  media_urls      text[],
  quoted_echo_id  uuid,
  parent_echo_id  uuid,
  remix_root_id   uuid,
  username        text,
  display_name    text,
  bio             text,
  avatar_color    text,
  avatar_url      text,
  is_verified     bool,
  follower_count  int,
  distance        float8
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  taste vector(768);
begin
  -- Average the embeddings of the user's recent likes.
  select avg(e.embedding)::vector(768)
    into taste
    from public.echo_likes l
    join public.public_echoes e on e.id = l.echo_id
    where l.user_id = p_user_id
      and e.embedding is not null
    order by l.created_at desc
    limit 20;

  -- Fall back to recent views / own publishes if no liked embeddings yet.
  if taste is null then
    select avg(e.embedding)::vector(768)
      into taste
      from (
        select echo_id, created_at from public.echo_views where user_id = p_user_id
        union all
        select id as echo_id, created_at from public.public_echoes where author_id = p_user_id
      ) src
      join public.public_echoes e on e.id = src.echo_id
      where e.embedding is not null
      order by src.created_at desc
      limit 20;
  end if;

  -- No signal at all → degrade gracefully to engagement-ranked recent echoes.
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
      from public.public_echoes e
      join public.profiles p on p.id = e.author_id
      where e.check_content = true
        and e.author_id <> p_user_id
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = p_user_id and b.blocked_id = e.author_id
        )
        and not exists (
          select 1 from public.user_mutes m
          where m.muter_id = p_user_id and m.muted_id = e.author_id
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
    from public.public_echoes e
    join public.profiles p on p.id = e.author_id
    where e.embedding is not null
      and e.check_content = true
      and e.author_id <> p_user_id
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = p_user_id and b.blocked_id = e.author_id
      )
      and not exists (
        select 1 from public.user_mutes m
        where m.muter_id = p_user_id and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$$;

-- ── 3. Partial index to keep the gated scans fast ────────────────────────────
create index if not exists public_echoes_check_content_created_idx
  on public.public_echoes (created_at desc)
  where check_content = true;
