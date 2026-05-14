-- Rename bookmarks → echo_bookmarks to match the expected table name in phase3_bookmark_collections.
alter table if exists public.bookmarks rename to echo_bookmarks;
