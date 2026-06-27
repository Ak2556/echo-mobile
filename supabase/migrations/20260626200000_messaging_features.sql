-- Messaging Features
-- Adds: quoted replies, message editing, pinned messages, DM media bucket

-- 1. Quoted replies + edit timestamps on messages
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_dm_reply_to ON public.direct_messages(reply_to_id);

-- 2. Pinned message per conversation (any participant can pin/unpin)
ALTER TABLE public.dm_conversations
  ADD COLUMN IF NOT EXISTS pinned_message_id uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL;

-- 3. dm-media storage bucket for DM photos / voice notes
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-media', 'dm-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow the sender to upload to their own subfolder: dm-media/<uid>/...
DROP POLICY IF EXISTS "dm_media_upload"  ON storage.objects;
CREATE POLICY "dm_media_upload"  ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dm-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can read (bucket is public so CDN URLs also work)
DROP POLICY IF EXISTS "dm_media_read"   ON storage.objects;
CREATE POLICY "dm_media_read"   ON storage.objects
  FOR SELECT USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');

-- Sender can delete their own uploads
DROP POLICY IF EXISTS "dm_media_delete" ON storage.objects;
CREATE POLICY "dm_media_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'dm-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
