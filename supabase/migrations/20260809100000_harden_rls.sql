-- Migration: Harden RLS for posts and private messages
-- 1. Ensure private echoes (posts) are only viewable by author or followers
-- 2. Ensure echo likes and comments respect the echo's privacy
-- 3. Ensure no user can update or delete another user's echo
-- 4. Lock down direct messages (prevent updating other's messages)
-- 5. Lock down DM media storage bucket

-- ==============================================================================
-- public_echoes (Posts) Privacy & Write Protection
-- ==============================================================================

-- Restrict SELECT on echoes so private profiles' echoes are hidden from non-followers
DROP POLICY IF EXISTS "Echoes are viewable by everyone" ON public.public_echoes;
DROP POLICY IF EXISTS "Echoes are viewable by authorized users" ON public.public_echoes;
CREATE POLICY "Echoes are viewable by authorized users" ON public.public_echoes
  FOR SELECT USING (
    auth.uid() = author_id
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public_echoes.author_id AND p.is_private = false
    )
    OR
    EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid() AND f.following_id = public_echoes.author_id
    )
  );

-- Harden UPDATE and DELETE to strictly author
DROP POLICY IF EXISTS "Users can update own echoes" ON public.public_echoes;
CREATE POLICY "Users can update own echoes" ON public.public_echoes
  FOR UPDATE USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete own echoes" ON public.public_echoes;
CREATE POLICY "Users can delete own echoes" ON public.public_echoes
  FOR DELETE USING (auth.uid() = author_id);

-- ==============================================================================
-- Cascade Privacy to echo_comments and echo_likes
-- ==============================================================================

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.echo_comments;
CREATE POLICY "Comments are viewable by authorized users" ON public.echo_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.public_echoes e
      WHERE e.id = echo_comments.echo_id
    )
  );

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.echo_likes;
CREATE POLICY "Likes are viewable by authorized users" ON public.echo_likes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.public_echoes e
      WHERE e.id = echo_likes.echo_id
    )
  );

-- ==============================================================================
-- direct_messages (Private Messages) Lockdown
-- ==============================================================================

-- Prevent users from updating other participants' messages
DROP POLICY IF EXISTS "dm_update_participants" ON public.direct_messages;
CREATE POLICY "dm_update_self" ON public.direct_messages
  FOR UPDATE USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- Ensure users can only delete their own messages
DROP POLICY IF EXISTS "dm_delete_self" ON public.direct_messages;
CREATE POLICY "dm_delete_self" ON public.direct_messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ==============================================================================
-- dm-media (Private Media) Lockdown
-- ==============================================================================

-- Revert the bucket back to private
UPDATE storage.buckets SET public = false WHERE id = 'dm-media';

-- Remove public access policy
DROP POLICY IF EXISTS "dm_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "dm_media_read" ON storage.objects;

-- Create restricted read policy for DM media
CREATE POLICY "dm_media_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dm-media' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR
      EXISTS (
        SELECT 1 FROM public.direct_messages dm
        JOIN public.dm_conversations c ON c.id = dm.conversation_id
        WHERE (dm.media_url LIKE '%' || storage.objects.name OR dm.voice_url LIKE '%' || storage.objects.name)
          AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
      )
    )
  );
