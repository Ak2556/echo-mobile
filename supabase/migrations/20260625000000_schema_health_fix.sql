-- ============================================================
-- Schema Health Fix — 2026-06-25
--
-- Fixes identified by comprehensive live-DB audit.
-- All changes are additive / idempotent (OR REPLACE, IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE). No tables are dropped or recreated.
-- ============================================================


-- ============================================================
-- FIX 1 [CRITICAL]: notifications_type_check constraint is missing
-- 'reaction', 'bookmark', 'quote' types.
--
-- 20260522120000_activity_tab_upgrade.sql added these three types.
-- 20260622200000_dsa_compliance.sql later dropped and recreated the
-- constraint WITHOUT including them, so any INSERT with type IN
-- ('reaction','bookmark','quote') now raises a CHECK violation.
-- This silently kills reaction/bookmark/quote notifications.
-- ============================================================
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'reaction', 'bookmark', 'quote',        -- from activity_tab_upgrade
    'report_resolved', 'content_removed',   -- from dsa_compliance
    'appeal_resolved'                        -- from dsa_appeals
  ));


-- ============================================================
-- FIX 2 [CRITICAL]: notify_on_appeal_resolved() inserts into
-- notifications using wrong column names.
--
-- The function body from 20260623100000_dsa_appeals.sql uses:
--   actor_id, recipient_id, kind, target_id
-- but public.notifications has:
--   actor_id, user_id,       type, target_id
-- This means the appeals_resolved_notify trigger fails with
-- "column recipient_id does not exist" every time an appeal is
-- resolved, breaking the DSA Art. 20 appeals notification flow.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_appeal_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status <> 'pending' AND old.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_kind, target_id)
    SELECT
      new.appellant_id,
      'appeal_resolved',
      NULL,
      'appeal',
      new.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'appeal_resolved' AND target_id = new.id
    );
  END IF;
  RETURN new;
END;
$$;


-- ============================================================
-- FIX 3 [HIGH]: adjust_follower_count() is SECURITY INVOKER
-- instead of SECURITY DEFINER.
--
-- The trigger fires under the context of the calling user. With
-- SECURITY INVOKER, the UPDATE on profiles.follower_count is
-- executed as the user, who only has column-level UPDATE rights
-- on profile fields (per identity_surface_hardening.sql) and
-- NOT on follower_count. Follow/unfollow actions silently fail
-- to update the counter.
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_follower_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
       SET follower_count = follower_count + 1
     WHERE id = new.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
       SET follower_count = greatest(0, follower_count - 1)
     WHERE id = old.following_id;
  END IF;
  RETURN NULL;
END;
$$;


-- ============================================================
-- FIX 4 [HIGH]: marketplace-photos storage bucket missing.
--
-- 20260623000000_marketplace_listings.sql creates the table
-- with a photo_urls text[] column and assumes uploads go into
-- a 'marketplace-photos' bucket. The bucket was never created,
-- so all marketplace photo uploads return "Bucket not found".
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-photos', 'marketplace-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the new bucket
DROP POLICY IF EXISTS "marketplace_photos_public_read" ON storage.objects;
CREATE POLICY "marketplace_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketplace-photos');

DROP POLICY IF EXISTS "marketplace_photos_authenticated_insert_own_prefix" ON storage.objects;
CREATE POLICY "marketplace_photos_authenticated_insert_own_prefix"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketplace-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "marketplace_photos_authenticated_update_own_prefix" ON storage.objects;
CREATE POLICY "marketplace_photos_authenticated_update_own_prefix"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketplace-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'marketplace-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "marketplace_photos_authenticated_delete_own_prefix" ON storage.objects;
CREATE POLICY "marketplace_photos_authenticated_delete_own_prefix"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketplace-photos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );


-- ============================================================
-- FIX 5 [MEDIUM]: echo_views is missing a composite index on
-- (echo_id, user_id) that matches the primary key lookup pattern
-- used by the rate limit trigger and view count queries.
-- The primary key (echo_id, user_id) covers this, but an explicit
-- index on echo_id alone aids aggregation queries.
-- ============================================================
CREATE INDEX IF NOT EXISTS echo_views_echo_user_idx
  ON public.echo_views (echo_id, user_id);

-- echo_reposts is missing a composite index used in feed queries
CREATE INDEX IF NOT EXISTS echo_reposts_echo_user_idx
  ON public.echo_reposts (echo_id, user_id);


-- ============================================================
-- FIX 6 [MEDIUM]: echo_comments is missing a composite index on
-- (echo_id, parent_comment_id) needed for nested comment queries.
-- ============================================================
CREATE INDEX IF NOT EXISTS echo_comments_echo_parent_idx
  ON public.echo_comments (echo_id, parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;


-- ============================================================
-- FIX 7 [MEDIUM]: notifications table is missing an index on
-- (user_id, read_at) which is the pattern used by the unread
-- count query in get_dm_conversations and the notifications feed.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;


-- ============================================================
-- FIX 8 [MEDIUM]: reports table is missing an index on
-- (reporter_id) needed for the appeals INSERT policy subquery
-- which joins reports by reporter_id.
-- (reporter_idx already exists; add target_type for moderation queries)
-- ============================================================
CREATE INDEX IF NOT EXISTS reports_reporter_type_idx
  ON public.reports (reporter_id, target_type);


-- ============================================================
-- FIX 9 [LOW]: profiles is missing a composite index on
-- (username lower-case) for case-insensitive username lookup.
-- This is needed for the OTP-based signup username availability check.
-- ============================================================
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx
  ON public.profiles (lower(username));


-- ============================================================
-- FIX 10 [LOW]: dm_conversations is missing a combined index
-- for the get_dm_conversations RPC ORDER BY last_message_at.
-- ============================================================
CREATE INDEX IF NOT EXISTS dm_conv_user_a_idx
  ON public.dm_conversations (user_a, last_message_at DESC);

CREATE INDEX IF NOT EXISTS dm_conv_user_b_idx
  ON public.dm_conversations (user_b, last_message_at DESC);


-- ============================================================
-- VERIFICATION NOTES (not executable — for audit trail only)
--
-- Issues confirmed NOT present after audit:
--   - RLS enabled: all 44 public tables have rowsecurity=true ✓
--   - handle_new_user trigger: on_auth_user_created on auth.users ✓
--   - Trigger exists: follows_adjust_follower_count ✓ (function fixed above)
--   - All notification triggers (like, comment, follow, repost, mention,
--     reaction, bookmark, quote) present ✓
--   - trg_notifications_push_fanout on notifications ✓
--   - on_remix_change, set_remix_lineage on public_echoes ✓
--   - All rate limit triggers from app_wide_rate_limits ✓
--   - Extensions: pg_cron, pg_net, supabase_vault all installed ✓
--   - avatars and echo-media storage buckets exist ✓
--   - appeals unique constraint (report_id, appellant_id) exists ✓
--   - get_dm_conversations uses auth.uid() guard (security_hardening) ✓
--   - get_similar_echoes, get_trending_evolutions, get_remix_tree
--     all filter check_content = true ✓
--   - thinking_fingerprints and rag_embedding_messages intentionally
--     have no RLS policies (service-role access only) ✓
--   - year_wraps: only service-role writes it (year-in-echo edge fn) ✓
-- ============================================================
