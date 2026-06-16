-- Security hardening: DB-level fixes for audit findings.
-- All changes are additive (DROP + CREATE OR REPLACE / DROP POLICY + CREATE POLICY).
-- Safe to re-run.

-- ============================================================
-- Fix A (HIGH): get_dm_conversations — caller isolation
--
-- The original function accepted an arbitrary p_user_id and was SECURITY
-- DEFINER, so any authenticated caller could read any user's DM metadata.
-- Fix: replace every reference to p_user_id with auth.uid() so the parameter
-- is accepted for back-compat but the result is always scoped to the caller.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_dm_conversations(uuid);
CREATE OR REPLACE FUNCTION public.get_dm_conversations(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  id                  uuid,
  other_user_id       uuid,
  other_username      text,
  other_display_name  text,
  other_avatar_color  text,
  last_message_at     timestamptz,
  last_message_text   text,
  last_message_kind   text,
  unread_count        bigint
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT
    dc.id,
    CASE WHEN dc.user_a = auth.uid() THEN dc.user_b ELSE dc.user_a END AS other_user_id,
    p.username        AS other_username,
    p.display_name    AS other_display_name,
    p.avatar_color    AS other_avatar_color,
    dc.last_message_at,
    dc.last_message_text,
    dc.last_message_kind,
    (
      SELECT COUNT(*)
        FROM direct_messages dm
       WHERE dm.conversation_id = dc.id
         AND dm.sender_id       != auth.uid()
         AND dm.read_at         IS NULL
         AND dm.deleted_at      IS NULL
    ) AS unread_count
  FROM dm_conversations dc
  JOIN profiles p
    ON p.id = CASE WHEN dc.user_a = auth.uid() THEN dc.user_b ELSE dc.user_a END
  WHERE dc.user_a = auth.uid() OR dc.user_b = auth.uid()
  ORDER BY dc.last_message_at DESC NULLS LAST
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_dm_conversations(uuid) TO authenticated;


-- ============================================================
-- Fix B (HIGH): direct_messages INSERT — require conversation membership
--
-- The previous policy only checked sender_id = auth.uid(), allowing any
-- authenticated user who knew a conversation UUID to inject messages into it.
-- ============================================================
DROP POLICY IF EXISTS "dm_insert_self" ON public.direct_messages;
CREATE POLICY "dm_insert_self" ON public.direct_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.dm_conversations c
      WHERE c.id = conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );


-- ============================================================
-- Fix C (MEDIUM): profiles UPDATE — freeze is_verified & follower_count
--
-- The previous policy had no WITH CHECK, so a user could call
-- supabase.from('profiles').update({ is_verified: true }) on their own row
-- and grant themselves the verified badge.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_verified IS NOT DISTINCT FROM (SELECT is_verified  FROM public.profiles WHERE id = auth.uid())
    AND follower_count IS NOT DISTINCT FROM (SELECT follower_count FROM public.profiles WHERE id = auth.uid())
  );


-- ============================================================
-- Fix D (MEDIUM): ai_rate_limits — remove user write access
--
-- Users could zero their own rate-limit counter by writing directly to this
-- table, bypassing the edge function's enforcement. The edge function uses
-- the service-role client for all writes, so removing user-level write
-- policies has no functional impact.
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own AI limit" ON public.ai_rate_limits;
DROP POLICY IF EXISTS "Users can update their own AI limit" ON public.ai_rate_limits;


-- ============================================================
-- Fix E (MEDIUM): moderation gate on side-channel RPCs
--
-- get_similar_echoes, get_trending_evolutions, and get_remix_tree were missing
-- check_content = true filters, letting flagged content surface via these RPCs
-- even though the primary feeds correctly excluded it.
-- ============================================================

-- get_similar_echoes
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
SET search_path = public
AS $$
  WITH anchor AS (
    SELECT embedding FROM public.public_echoes WHERE id = p_echo_id AND check_content = true
  )
  SELECT
    e.id, e.author_id, e.title, e.prompt, e.response,
    e.likes_count, e.comment_count, e.repost_count, e.view_count,
    e.remix_count, e.created_at, e.media_urls,
    e.parent_echo_id, e.remix_root_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    (e.embedding <=> (SELECT embedding FROM anchor))::float8 AS distance
  FROM public.public_echoes e
  JOIN public.profiles p ON p.id = e.author_id
  WHERE e.id <> p_echo_id
    AND e.check_content = true
    AND e.embedding IS NOT NULL
    AND (SELECT embedding FROM anchor) IS NOT NULL
  ORDER BY e.embedding <=> (SELECT embedding FROM anchor) ASC
  LIMIT p_limit;
$$;

-- get_trending_evolutions
CREATE OR REPLACE FUNCTION public.get_trending_evolutions(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
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
  unique_authors    int,
  tree_engagement   bigint,
  newest_remix_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH tree AS (
    SELECT
      COALESCE(remix_root_id, id) AS root_id,
      author_id,
      likes_count + comment_count * 2 + repost_count * 2 AS eng,
      created_at,
      parent_echo_id
    FROM public.public_echoes
    WHERE check_content = true
  ),
  agg AS (
    SELECT
      root_id,
      COUNT(*) FILTER (WHERE parent_echo_id IS NOT NULL) AS branch_count,
      COUNT(DISTINCT author_id)                          AS unique_authors,
      SUM(eng)::bigint                                   AS tree_engagement,
      MAX(CASE WHEN parent_echo_id IS NOT NULL THEN created_at END) AS newest_remix_at
    FROM tree
    GROUP BY root_id
    HAVING COUNT(*) FILTER (WHERE parent_echo_id IS NOT NULL) >= 1
  )
  SELECT
    a.root_id,
    r.title, r.prompt, r.response, r.created_at, r.media_urls, r.author_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    a.branch_count::int, a.unique_authors::int, a.tree_engagement, a.newest_remix_at
  FROM agg a
  JOIN public.public_echoes r ON r.id = a.root_id AND r.check_content = true
  JOIN public.profiles p ON p.id = r.author_id
  ORDER BY a.tree_engagement DESC, a.newest_remix_at DESC NULLS LAST
  LIMIT p_limit;
$$;

-- get_remix_tree
CREATE OR REPLACE FUNCTION public.get_remix_tree(
  p_root_id uuid
)
RETURNS TABLE (
  id              uuid,
  parent_echo_id  uuid,
  depth           int,
  author_id       uuid,
  title           text,
  prompt          text,
  response        text,
  likes_count     int,
  comment_count   int,
  repost_count    int,
  remix_count     int,
  created_at      timestamptz,
  media_urls      text[],
  username        text,
  display_name    text,
  avatar_color    text,
  avatar_url      text,
  is_verified     bool
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE lineage AS (
    SELECT e.*, 0 AS depth
      FROM public.public_echoes e
     WHERE e.id = p_root_id
       AND e.check_content = true
    UNION ALL
    SELECT e.*, l.depth + 1
      FROM public.public_echoes e
      JOIN lineage l ON e.parent_echo_id = l.id
     WHERE l.depth < 8
       AND e.check_content = true
  )
  SELECT
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  FROM lineage l
  JOIN public.profiles p ON p.id = l.author_id
  ORDER BY l.depth ASC,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) DESC,
           l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_similar_echoes(uuid, int)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_evolutions(int)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_remix_tree(uuid)             TO authenticated, anon;
