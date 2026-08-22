-- Enforce strict upload constraints at the Storage Bucket level to prevent initial decompression bombs

-- Avatars: Max 5MB, strict MIME types
UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';

-- Echo Media (Images/Videos): Max 50MB, strict MIME types
UPDATE storage.buckets
SET file_size_limit = 52428800, -- 50MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
WHERE id = 'echo-media';
