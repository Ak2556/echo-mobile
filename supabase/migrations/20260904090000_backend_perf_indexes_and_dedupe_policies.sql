-- Backend performance, tier 1: structure only, no policy semantics changed.
--
-- From the Supabase performance advisor (228 findings at the time). This closes
-- the four that are purely structural. The unwrapped auth.uid() calls in RLS are
-- the next migration.

-- 1. Index every foreign key that lacked one (34). Generated from pg_constraint,
--    not hand-written. The cost that bites first is account deletion: 13 of these
--    cascade from auth.users, so a DPDP erasure request sequential-scans a table
--    per FK. Invisible at 54 users, not at 100k.
create index if not exists idx_ai_messages_user_id on public.ai_messages (user_id);
create index if not exists idx_ai_tool_calls_conversation_id on public.ai_tool_calls (conversation_id);
create index if not exists idx_ai_tool_calls_message_id on public.ai_tool_calls (message_id);
create index if not exists idx_bookmark_collections_owner_id on public.bookmark_collections (owner_id);
create index if not exists idx_calls_callee_id on public.calls (callee_id);
create index if not exists idx_calls_caller_id on public.calls (caller_id);
create index if not exists idx_calls_conversation_id on public.calls (conversation_id);
create index if not exists idx_daily_answer_reactions_user_id on public.daily_answer_reactions (user_id);
create index if not exists idx_daily_answers_echo_id on public.daily_answers (echo_id);
create index if not exists idx_direct_messages_sender_id on public.direct_messages (sender_id);
create index if not exists idx_direct_messages_shared_echo_id on public.direct_messages (shared_echo_id);
create index if not exists idx_dm_conversations_created_by on public.dm_conversations (created_by);
create index if not exists idx_dm_conversations_pinned_message_id on public.dm_conversations (pinned_message_id);
create index if not exists idx_dm_prefs_user_id on public.dm_prefs (user_id);
create index if not exists idx_echo_bookmarks_collection_id on public.echo_bookmarks (collection_id);
create index if not exists idx_learn_bookings_package_id on public.learn_bookings (package_id);
create index if not exists idx_learn_bookings_slot_id on public.learn_bookings (slot_id);
create index if not exists idx_learn_lecture_notes_booking_id on public.learn_lecture_notes (booking_id);
create index if not exists idx_message_reactions_user_id on public.message_reactions (user_id);
create index if not exists idx_office_hour_question_upvotes_user_id on public.office_hour_question_upvotes (user_id);
create index if not exists idx_office_hour_questions_asker_id on public.office_hour_questions (asker_id);
create index if not exists idx_office_hour_rsvps_user_id on public.office_hour_rsvps (user_id);
create index if not exists idx_public_echoes_source_conversation_id on public.public_echoes (source_conversation_id);
create index if not exists idx_quests_reward_badge_id on public.quests (reward_badge_id);
create index if not exists idx_reports_reviewed_by on public.reports (reviewed_by);
create index if not exists idx_user_auras_user_id on public.user_auras (user_id);
create index if not exists idx_user_badges_badge_id on public.user_badges (badge_id);
create index if not exists idx_user_blocks_blocked_id on public.user_blocks (blocked_id);
create index if not exists idx_user_mutes_muted_id on public.user_mutes (muted_id);
create index if not exists idx_user_not_interested_author_id on public.user_not_interested (author_id);
create index if not exists idx_user_not_interested_echo_id on public.user_not_interested (echo_id);
create index if not exists idx_user_quests_quest_id on public.user_quests (quest_id);
create index if not exists idx_verification_requests_reviewed_by on public.verification_requests (reviewed_by);
create index if not exists idx_year_wraps_top_echo_id on public.year_wraps (top_echo_id);

-- 2. Drop exact duplicate indexes. Same table, same columns, same uniqueness —
--    every write maintained both.
drop index if exists public.echo_comments_parent_idx;   -- keeps idx_echo_comments_parent
drop index if exists public.idx_public_echoes_created;  -- keeps public_echoes_created_idx

-- 3. Drop duplicate permissive RLS policies (10 pairs). Each pair was
--    byte-identical: same table, command, roles, and the same md5 of
--    (qual || with_check). Schema drift — two migrations created the same rule
--    under different names. A permissive duplicate is not a second gate;
--    Postgres ORs them, so both were evaluated on every row of every query, on
--    the hottest tables in the app.
drop policy if exists "Users can remove bookmarks"    on public.echo_bookmarks;
drop policy if exists "Users can bookmark echoes"     on public.echo_bookmarks;
drop policy if exists "Users can view own bookmarks"  on public.echo_bookmarks;
drop policy if exists "Users can delete own comments" on public.echo_comments;
drop policy if exists "Users can insert own comments" on public.echo_comments;
drop policy if exists "Users can unlike echoes"       on public.echo_likes;
drop policy if exists "Users can like echoes"         on public.echo_likes;
drop policy if exists "Users can unfollow"            on public.follows;
drop policy if exists "Users can follow others"       on public.follows;
drop policy if exists "Follows are viewable"          on public.follows;

-- 4. Give user_not_interested a primary key. echo_id and author_id are both
--    nullable (a row records disinterest in EITHER an echo or an author), so no
--    natural composite key exists and a surrogate is the only option. Without a
--    PK, logical replication cannot address rows in this table at all.
alter table public.user_not_interested
  add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_not_interested'::regclass and contype = 'p'
  ) then
    alter table public.user_not_interested add primary key (id);
  end if;
end $$;
