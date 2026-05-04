-- Performance indexes and storage policy hardening identified in audit.

-- 1. echo_reposts: composite index for deduplication queries (echo_id, user_id)
--    The unique constraint already enforces uniqueness but the separate
--    single-column indexes don't help queries that filter on both columns.
create index if not exists echo_reposts_echo_user_idx
  on public.echo_reposts (echo_id, user_id);

-- 2. echo_views: add echo_id to the user index so views-per-echo lookups
--    can be served by an index scan instead of a seq scan.
create index if not exists echo_views_echo_user_idx
  on public.echo_views (echo_id, user_id);

-- 3. dm_conversations: allow inbox queries to use index-only scans
--    instead of scanning the full table to list conversations for a user.
create index if not exists dm_conv_user_a_idx
  on public.dm_conversations (user_a, last_message_at desc);
create index if not exists dm_conv_user_b_idx
  on public.dm_conversations (user_b, last_message_at desc);

-- 4. echo_comments: composite index for threaded comment queries
--    (WHERE echo_id = ? ORDER BY parent_comment_id DESC).
create index if not exists echo_comments_echo_parent_idx
  on public.echo_comments (echo_id, parent_comment_id desc nulls last);

-- 5. Storage: restrict public read on echo-media to files under the
--    uploading user's own prefix so an auth bug cannot expose other
--    users' uploads.
drop policy if exists "echo_media_public_read" on storage.objects;
create policy "echo_media_public_read"
  on storage.objects for select
  using (
    bucket_id = 'echo-media'
    and split_part(name, '/', 1) = auth.uid()::text
  );
