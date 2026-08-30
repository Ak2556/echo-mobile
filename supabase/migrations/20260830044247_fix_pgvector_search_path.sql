-- Restore the four pgvector-backed RPCs, dead in production since 2026-08-11.
--
-- 20260811020000_fix_supabase_linter_warnings.sql ran
--     ALTER EXTENSION vector SET SCHEMA extensions
-- to clear the extension_in_public linter warning. These four functions have
-- carried `SET search_path = public` since they were first defined, which was
-- fine while pgvector lived in public — but once the type and its operators
-- moved to `extensions`, every call started failing at function startup:
--
--   get_semantic_feed            ERROR 42704 type "vector" does not exist
--   get_thinking_partners        ERROR 42704 type "vector" does not exist
--   get_divergent_daily_answers  ERROR 42704 type "vector" does not exist
--   get_similar_echoes           ERROR 42883 operator does not exist:
--                                  extensions.vector <=> extensions.vector
--
-- That silently killed the semantic "for you" feed, similar echoes, thinking
-- partners, and divergent takes on the daily question — the RPCs throw, the
-- callers in lib/supabaseEchoApi.ts surface an error or an empty list, and
-- nothing else reported it. The move itself was correct, so the fix is to let
-- these functions resolve the extension schema rather than to move pgvector back.
--
-- `extensions` is appended after `public` so unqualified names still resolve to
-- public first; only the pgvector type and operators come from `extensions`.
-- Bodies are deliberately untouched — this is a search_path-only change.

alter function public.get_semantic_feed(uuid, integer)                    set search_path = public, extensions;
alter function public.get_similar_echoes(uuid, integer)                   set search_path = public, extensions;
alter function public.get_thinking_partners(uuid, integer, text)          set search_path = public, extensions;
alter function public.get_divergent_daily_answers(uuid, uuid, integer)    set search_path = public, extensions;
