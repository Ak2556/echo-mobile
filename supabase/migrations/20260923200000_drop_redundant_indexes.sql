-- Three indexes another index already covers.
--
-- public_echoes carried 18 indexes for 84 rows, and every insert paid to
-- maintain all of them. These three are redundant rather than merely unused,
-- which is the distinction that makes dropping them safe: each one's work is
-- already done by an index that stays.
--
--   public_echoes_author_idx (author_id)
--       A strict prefix of idx_public_echoes_author (author_id, created_at
--       DESC). Postgres serves an author_id lookup from the composite.
--
--   public_echoes_check_content_created_idx (created_at DESC) WHERE check_content
--       Covered by idx_public_echoes_check_content (check_content, created_at
--       DESC), which answers the same feed queries and more.
--
--   idx_public_echoes_likes (likes_count DESC)
--       A strict prefix of public_echoes_engagement_idx, and ranking no longer
--       orders by raw likes — it reads trending_echoes_mv.
--
-- Left alone on purpose: the indexes with zero scans that belong to features
-- not in use yet (salons, pinned posts, remix trees). An index for a feature
-- nobody has opened is not the same as a redundant one, and dropping those
-- would be a slow surprise the first time somebody does.
--
-- Reversible: each index can be recreated from the definition above.

begin;

drop index if exists public.public_echoes_author_idx;
drop index if exists public.public_echoes_check_content_created_idx;
drop index if exists public.idx_public_echoes_likes;

commit;
