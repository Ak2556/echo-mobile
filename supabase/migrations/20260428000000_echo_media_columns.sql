-- Add media columns to public_echoes for photo and video posts
ALTER TABLE public_echoes
  ADD COLUMN IF NOT EXISTS media_uris jsonb,
  ADD COLUMN IF NOT EXISTS video_uri  text;

-- Recreate the view to include the new columns
CREATE OR REPLACE VIEW public.public_echoes_with_author AS
  SELECT
    e.id,
    e.author_id,
    e.title,
    e.prompt,
    e.response,
    e.media_uris,
    e.video_uri,
    e.likes_count,
    e.comment_count,
    e.repost_count,
    e.view_count,
    e.created_at,
    p.username,
    p.display_name,
    p.avatar_color,
    p.is_verified
  FROM public_echoes e
  LEFT JOIN profiles p ON p.id = e.author_id;

GRANT SELECT ON public.public_echoes_with_author TO anon, authenticated;
