-- 20260817000000_trending_materialized_view.sql

-- 1. Create a Materialized View for the heavy computations (Global Trending Score)
-- This computes the time-decay and engagement scores for all active echoes.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.trending_echoes_mv AS
SELECT
  e.id,
  e.author_id,
  e.created_at,
  -- Precompute the global engagement/time score (ignoring personalization)
  (
    (e.likes_count * 3.0 + e.comment_count * 5.0 + e.repost_count * 4.0 + e.view_count * 0.3)
    / power(greatest(extract(epoch from (now() - e.created_at)) / 3600.0, 0.1) + 2.0, 1.8) -- Default gravity 1.8
    * (1.0 + (e.likes_count + e.comment_count + e.repost_count)::float8 / greatest(e.view_count, 1) * 2.0)
    * case
        when e.media_urls is not null and array_length(e.media_urls, 1) > 0 then 1.2
        else 1.0
      end
  ) as global_score
FROM public.public_echoes e
-- Only consider echoes from the last 30 days to keep the materialized view lean and fast
WHERE e.created_at > (now() - interval '30 days');

-- 2. Index for fast sorting on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS trending_echoes_mv_id_idx ON public.trending_echoes_mv(id);
CREATE INDEX IF NOT EXISTS trending_echoes_mv_score_idx ON public.trending_echoes_mv(global_score DESC);

-- 3. Create a pg_cron job to refresh this view every 5 minutes
-- (Requires pg_cron extension to be enabled)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Attempt to schedule the job, handling if it already exists
    PERFORM cron.schedule(
      'refresh_trending_echoes',
      '*/5 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.trending_echoes_mv;'
    );
  END IF;
END $$;

-- 4. Overwrite the `get_ranked_feed` to utilize this MV for massive performance gains
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
          WHERE f2.follower_id = p_user_id AND f2.following_id = e.author_id
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
