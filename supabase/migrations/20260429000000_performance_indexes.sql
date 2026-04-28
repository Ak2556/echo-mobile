-- Performance indexes: covering the most common query patterns
-- (echo_id lookups on comments/likes, user_id lookups on bookmarks,
--  author_id on echoes, and both sides of the follows join)

CREATE INDEX IF NOT EXISTS idx_echo_comments_echo_id  ON echo_comments(echo_id);
CREATE INDEX IF NOT EXISTS idx_echo_likes_echo_id     ON echo_likes(echo_id);
CREATE INDEX IF NOT EXISTS idx_echo_bookmarks_user_id ON echo_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_public_echoes_author   ON public_echoes(author_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower       ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following      ON follows(following_id);
