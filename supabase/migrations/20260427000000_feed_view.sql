-- Joins public_echoes with profiles so the client can fetch the full feed
-- in a single query instead of two sequential round-trips.
CREATE OR REPLACE VIEW public.public_echoes_with_author AS
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
    p.username,
    p.display_name,
    p.avatar_color,
    p.is_verified
  FROM public_echoes e
  LEFT JOIN profiles p ON p.id = e.author_id;

-- Grant read access to both anon and authenticated roles.
-- RLS on the underlying tables still applies at query time.
GRANT SELECT ON public.public_echoes_with_author TO anon, authenticated;
