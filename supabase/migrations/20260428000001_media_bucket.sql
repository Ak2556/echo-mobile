-- Create a public bucket for user-uploaded images and videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/mov']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder (uid/filename)
CREATE POLICY "Users can upload own media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can read public media (CDN URLs)
CREATE POLICY "Public media read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- Users can delete their own uploads
CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
