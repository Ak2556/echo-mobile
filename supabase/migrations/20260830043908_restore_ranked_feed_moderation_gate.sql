-- SECURITY / CONTENT SAFETY: restore the moderation gate to get_ranked_feed.
--
-- 20260529000000_enforce_moderation_gate.sql added `e.check_content = true` to
-- get_ranked_feed. That gate was dropped when the function was rewritten to use
-- trending_echoes_mv in 20260817000000_trending_materialized_view.sql, and the
-- later 20260819160000_fix_following_feed.sql rewrite did not restore it — so
-- from 2026-08-17 the app's primary feed served posts that had failed or never
-- completed moderation.
--
-- Nothing else caught it:
--   * get_ranked_feed is SECURITY DEFINER, so RLS is bypassed — and the SELECT
--     policy "Anon can read echoes" is `qual: true` anyway; the gate has always
--     been applied in the query, not in RLS.
--   * The RETURNS TABLE does not include check_content, so the client-side
--     defense in lib/feedFilter.ts sees `checkContent === undefined` and, by its
--     own documented rule, treats unknown rows as safe to display.
-- Every sibling reader (get_semantic_feed, get_similar_echoes,
-- get_thinking_partners, get_trending_evolutions, get_remix_tree) kept the gate;
-- get_ranked_feed was the only one missing it.
--
-- Note (not changed here): trending_echoes_mv itself has no check_content filter,
-- so unmoderated echo ids/author_ids still enter the materialized ranking and the
-- view is selectable by anon. That leaks metadata only (no title/prompt/response)
-- and is tracked separately; this migration closes the content exposure.

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
    FROM public.public_echoes e
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
