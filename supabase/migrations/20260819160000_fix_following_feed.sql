-- 20260819160000_fix_following_feed.sql

CREATE OR REPLACE FUNCTION public.get_ranked_feed(
  p_user_id        uuid    default null,
  p_limit          int     default 20,
  p_gravity        float8  default 1.8,
  p_cursor_score   float8  default null,
  p_cursor_id      uuid    default null,
  p_following_only boolean default false
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    FROM public.public_echoes e
    JOIN public.profiles p ON p.id = e.author_id
    LEFT JOIN public.trending_echoes_mv mv ON mv.id = e.id
    WHERE
      -- Block/mute filters
      (p_user_id IS NULL OR NOT EXISTS (
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
$$;
