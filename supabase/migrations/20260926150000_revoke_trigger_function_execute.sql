-- Trigger functions are not RPCs. Postgres grants EXECUTE to PUBLIC on every
-- new function, so each SECURITY DEFINER trigger function also showed up under
-- /rest/v1/rpc/<name>. The Supabase linter flagged the 18 still granted
-- (lints 0028/0029).
--
-- Calling one directly does nothing but raise "trigger functions can only be
-- called as triggers", and firing a trigger does not check EXECUTE on its
-- function, so revoking changes no behaviour. It removes 48 dead entries
-- from the API surface and clears the lint. Some of these were already revoked
-- in earlier migrations; repeating the revoke is a no-op and keeps the whole
-- class in one place.
--
-- lib/securityHardening.test.ts fails if a SECURITY DEFINER trigger function is
-- added without a matching revoke.

revoke all on function public.act_on_urgent_report() from public, anon, authenticated;
revoke all on function public.add_salon_owner_as_member() from public, anon, authenticated;
revoke all on function public.adjust_comment_likes_count() from public, anon, authenticated;
revoke all on function public.adjust_comment_reaction_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_comment_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_likes_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_reaction_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_remix_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_repost_count() from public, anon, authenticated;
revoke all on function public.adjust_echo_view_count() from public, anon, authenticated;
revoke all on function public.adjust_follower_count() from public, anon, authenticated;
revoke all on function public.adjust_oh_question_upvote_count() from public, anon, authenticated;
revoke all on function public.adjust_oh_rsvp_count() from public, anon, authenticated;
revoke all on function public.adjust_salon_echo_count() from public, anon, authenticated;
revoke all on function public.adjust_salon_member_count() from public, anon, authenticated;
revoke all on function public.bump_quote_repost_count() from public, anon, authenticated;
revoke all on function public.cleanup_on_echo_unlike() from public, anon, authenticated;
revoke all on function public.enforce_dm_blocks() from public, anon, authenticated;
revoke all on function public.enforce_dm_requests() from public, anon, authenticated;
revoke all on function public.enforce_group_adds() from public, anon, authenticated;
revoke all on function public.enforce_insert_rate_limit() from public, anon, authenticated;
revoke all on function public.enforce_minor_profiling_off() from public, anon, authenticated;
revoke all on function public.enforce_profile_update_rate_limit() from public, anon, authenticated;
revoke all on function public.fanout_push_on_notification() from public, anon, authenticated;
revoke all on function public.fn_daily_reaction_notify() from public, anon, authenticated;
revoke all on function public.fn_dm_push_notify() from public, anon, authenticated;
revoke all on function public.fn_friend_daily_answer_notify() from public, anon, authenticated;
revoke all on function public.fn_friend_post_notify() from public, anon, authenticated;
revoke all on function public.fn_social_task_notify() from public, anon, authenticated;
revoke all on function public.fn_sync_conv_last_message() from public, anon, authenticated;
revoke all on function public.guard_media_provenance() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_remix_lineage() from public, anon, authenticated;
revoke all on function public.hold_moderated_content() from public, anon, authenticated;
revoke all on function public.moderate_new_echo() from public, anon, authenticated;
revoke all on function public.notify_on_appeal_resolved() from public, anon, authenticated;
revoke all on function public.notify_on_comment() from public, anon, authenticated;
revoke all on function public.notify_on_comment_mention() from public, anon, authenticated;
revoke all on function public.notify_on_echo_bookmark() from public, anon, authenticated;
revoke all on function public.notify_on_echo_like() from public, anon, authenticated;
revoke all on function public.notify_on_echo_mention() from public, anon, authenticated;
revoke all on function public.notify_on_echo_quote() from public, anon, authenticated;
revoke all on function public.notify_on_echo_reaction() from public, anon, authenticated;
revoke all on function public.notify_on_follow() from public, anon, authenticated;
revoke all on function public.notify_reporter_on_resolution() from public, anon, authenticated;
revoke all on function public.restore_content_on_overturned_appeal() from public, anon, authenticated;
revoke all on function public.restore_on_dismissed_urgent_report() from public, anon, authenticated;
revoke all on function public.validate_date_of_birth() from public, anon, authenticated;
