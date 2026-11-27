-- Take the anon role off the tables it has no reason to read.
--
-- Audit of the live project, 2026-11-18 (read-only catalog queries):
--   * every public table has row level security on; no policy allows an anonymous write;
--   * anon holds no INSERT/UPDATE/DELETE/TRUNCATE grant on any public table;
--   * every SECURITY DEFINER function that takes a user id binds it to auth.uid() or to service_role;
--   * profiles exposes only public columns to anon (no date_of_birth, no push token, no keys);
--   * new tables made by the migration role already default to anon SELECT only (checked in pg_default_acl).
-- So RLS already returns nothing to anon on the tables below. This removes the grant as well, so a
-- future policy mistake on one of them cannot open it to the public anon key.
--
-- The 30 tables anon legitimately reads (profiles, public_echoes, follows, daily_questions, ...)
-- are NOT touched; each has an explicit anon-visible policy. The three views are untouched.
--
-- Cost: an anon request to one of these tables now gets 401 / 42501 (permission denied) instead of [].
--
-- Applied to production 2026-11-18 and checked live with the publishable key: profiles, public_echoes,
-- daily_questions and feature_flags still read; push_tokens, user_entitlements and dm_conversations,
-- and profiles.date_of_birth, are denied.
-- Signed-in users use the authenticated role and are unaffected.
-- Idempotent: REVOKE of a privilege that is not held is a no-op.

revoke select on table
  public.ad_events,
  public.ai_conversations,
  public.ai_messages,
  public.ai_rate_limits,
  public.ai_tool_calls,
  public.app_rate_limits,
  public.appeals,
  public.bookmark_collections,
  public.calls,
  public.dm_conversation_members,
  public.dm_conversations,
  public.dm_prefs,
  public.echo_bookmarks,
  public.echo_views,
  public.expense_settings,
  public.expense_tx,
  public.fitness_goals,
  public.fitness_meal,
  public.fitness_measurement,
  public.fitness_water,
  public.fitness_weight,
  public.fitness_workout,
  public.habit,
  public.habit_entry,
  public.learn_bookings,
  public.learn_lecture_notes,
  public.learn_lectures,
  public.message_reactions,
  public.mini_app_data,
  public.mini_app_share,
  public.moderation_decisions,
  public.notification_profiles,
  public.notifications,
  public.push_tokens,
  public.rag_embedding_messages,
  public.subscription_webhook_events,
  public.task_item,
  public.thinking_fingerprints,
  public.user_auras,
  public.user_blocks,
  public.user_entitlements,
  public.user_interests,
  public.user_mutes,
  public.user_not_interested,
  public.user_quests,
  public.user_taste,
  public.verification_requests,
  public.whatsapp_link_codes,
  public.whatsapp_links,
  public.year_wraps
from anon;
