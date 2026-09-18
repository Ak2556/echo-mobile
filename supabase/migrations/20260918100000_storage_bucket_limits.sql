-- Size and MIME limits on the four buckets that had neither.
--
-- Object-level RLS was already right: every bucket confines a writer to a
-- folder named after their own auth.uid(). What was missing is bucket-level
-- constraint, and the buckets were created with `file_size_limit` and
-- `allowed_mime_types` left null, which Storage reads as "anything, any size".
--
-- marketplace-photos is the serious one, because it is also `public = true`:
--
--   * Any authenticated user could upload an unbounded number of unbounded
--     files. This project has already been rate-limited for egress once
--     (PostgREST answering 402), so this is not theoretical.
--   * Storage serves an object with the content-type it was stored with, and a
--     public bucket needs no token to read. `text/html` therefore gets a
--     stable, public, TLS-served URL on a Supabase domain — a phishing page
--     that looks like it belongs to us — and SVG carries script in the same
--     way. Neither is a marketplace photo.
--
-- The limits below are the types each client path actually sends, so nothing
-- honest changes:
--
--   marketplace-photos  lib/marketplaceApi.ts sends image/<ext>
--   dm-media            lib/supabaseEchoApi.ts has its own image/video
--                       allowlist; this makes the server agree, because a
--                       client-side allowlist is a suggestion
--   mini-app-media      studio sends image/jpeg and video/mp4, voice-memo
--                       sends audio/mp4. normalizeContentType returns any
--                       caller-supplied type verbatim, so `text/html` was
--                       reachable here too
--   verification        lib/verificationApi.ts sends exactly image/jpeg
--
-- Sizes follow the existing buckets: 5 MB for a single image (as avatars),
-- 50 MB where video is allowed (as echo-media).

begin;

update storage.buckets set
  file_size_limit = 10485760,  -- 10 MB; listing photos, several per listing
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'marketplace-photos';

update storage.buckets set
  file_size_limit = 52428800,  -- 50 MB
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'video/mp4','video/quicktime','video/x-m4v','video/webm'
  ]
where id = 'dm-media';

update storage.buckets set
  file_size_limit = 52428800,  -- 50 MB
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'video/mp4','video/quicktime','video/x-m4v','video/webm',
    'audio/mp4','audio/mpeg','audio/wav'
  ]
where id = 'mini-app-media';

update storage.buckets set
  file_size_limit = 5242880,   -- 5 MB; one selfie
  allowed_mime_types = array['image/jpeg']
where id = 'verification';

commit;
