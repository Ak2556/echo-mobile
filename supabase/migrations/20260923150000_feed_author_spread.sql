-- Feed curation, part two: measure the author spread, then set the curve.
--
-- 20260923140000 capped an author at three posts per day and damped by their
-- rank within that day. Measured on production immediately afterwards, a page
-- of twenty still held nine posts from one author, because that author had
-- posted on nine different days: a per-day cap says nothing about how much of
-- one page a single person can own.
--
-- So the dampening now keys off the author's rank across all their posts, not
-- within a day, while the per-day cap stays as the hard limit. Curves measured
-- against the real corpus (top twenty, per-day cap held at three):
--
--     curve   authors in top 20   most from one author
--     none            6                   11
--     0.60           10                    4
--     0.45           11                    3
--     0.30           12                    3
--     0.20           12                    3
--
-- 0.45 is the knee. Below it the page gains at most one more author while
-- punishing someone who simply posts often and well. The exponent is capped at
-- eight steps so a long tail cannot underflow to zero.

begin;

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
    -- Both ranks are computed over the author's own posts, never over the
    -- page, so they are identical on page 1 and page 5 and the keyset cursor
    -- stays correct. author_rank spreads the page; day_rank is the hard cap.
    SELECT eg.*,
           row_number() OVER (
             PARTITION BY eg.author_id
             ORDER BY eg.base_score DESC, eg.id DESC
           ) AS author_rank,
           row_number() OVER (
             PARTITION BY eg.author_id, date_trunc('day', eg.created_at)
             ORDER BY eg.base_score DESC, eg.id DESC
           ) AS day_rank
    FROM eligible eg
  ),
  scored AS (
    SELECT
      r.id, r.author_id, r.title, r.prompt, r.response,
      r.likes_count, r.comment_count, r.repost_count, r.view_count,
      r.created_at, r.media_urls, r.quoted_echo_id,
      r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
      r.is_verified, r.follower_count, r.day_rank,
      (
        r.base_score
        * (1.0 + log(greatest(r.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * CASE WHEN r.viewer IS NOT NULL AND r.follows_author THEN 1.5 ELSE 1.0 END
        -- Each further post by the same author counts 0.45 of the one before,
        -- to eight steps. Their best work still leads; their archive does not
        -- fill the page.
        * power(0.45::float8, least(r.author_rank - 1, 8)::float8)
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
    -- Three posts per author per day, lifted for the following-only feed where
    -- seeing one person's whole day is the point.
    (p_following_only OR s.day_rank <= 3)
    AND (
      p_cursor_score IS NULL
      OR s.rank_score < p_cursor_score
      OR (s.rank_score = p_cursor_score AND s.id < p_cursor_id)
    )
  ORDER BY s.rank_score DESC, s.id DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

commit;
