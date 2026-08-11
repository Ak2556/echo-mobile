-- Drop the correct public bucket listing policies
DROP POLICY IF EXISTS "marketplace_photos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "marketplace_photos_read" ON storage.objects;

-- Revoke anon execute for all flagged RPCs
DO $$
DECLARE
    r record;
    funcs_to_revoke_anon text[] := ARRAY[
        'add_group_members', 'add_salon_owner_as_member', 'adjust_echo_remix_count',
        'adjust_echo_repost_count', 'adjust_echo_view_count', 'adjust_follower_count',
        'adjust_oh_question_upvote_count', 'adjust_oh_rsvp_count', 'adjust_salon_echo_count',
        'adjust_salon_member_count', 'assert_group_admin', 'bump_quote_repost_count',
        'check_app_rate_limit', 'cleanup_on_echo_unlike', 'create_group_conversation',
        'delete_account', 'enforce_insert_rate_limit', 'enforce_profile_update_rate_limit',
        'ensure_daily_question', 'fanout_push_on_notification', 'fn_daily_reaction_notify',
        'fn_dm_push_notify', 'fn_friend_post_notify', 'fn_social_task_notify',
        'fn_sync_conv_last_message', 'following_fitness_leaderboard', 'following_habit_leaderboard',
        'get_divergent_daily_answers', 'get_dm_conversations', 'get_group_members',
        'get_or_create_dm_conversation', 'get_ranked_feed', 'get_remix_tree', 'get_semantic_feed',
        'get_similar_echoes', 'get_thinking_partners', 'get_trending_evolutions', 'handle_remix_lineage',
        'is_dm_conversation_member', 'leave_group', 'moderate_new_echo', 'moderator_remove_echo',
        'notify_on_appeal_resolved', 'notify_on_comment', 'notify_on_comment_mention',
        'notify_on_echo_bookmark', 'notify_on_echo_like', 'notify_on_echo_mention',
        'notify_on_echo_quote', 'notify_on_echo_reaction', 'notify_on_follow',
        'notify_reporter_on_resolution', 'remove_group_member', 'restore_content_on_overturned_appeal',
        'resweep_unmoderated_echoes', 'rls_auto_enable', 'set_group_member_role', 'update_group_meta'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY funcs_to_revoke_anon
    LOOP
        FOR r IN 
            SELECT p.oid::regprocedure::text AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM anon';
        END LOOP;
    END LOOP;
END $$;

-- Revoke authenticated execute for functions that are clearly internal triggers
-- (Functions prefixed with fn_, or internal housekeeping that clients shouldn't call)
DO $$
DECLARE
    r record;
    triggers_to_revoke_auth text[] := ARRAY[
        'cleanup_on_echo_unlike', 'fanout_push_on_notification', 'fn_daily_reaction_notify',
        'fn_dm_push_notify', 'fn_friend_post_notify', 'fn_social_task_notify',
        'fn_sync_conv_last_message', 'handle_remix_lineage', 'notify_on_appeal_resolved',
        'notify_on_comment', 'notify_on_comment_mention', 'notify_on_echo_bookmark',
        'notify_on_echo_like', 'notify_on_echo_mention', 'notify_on_echo_quote',
        'notify_on_echo_reaction', 'notify_on_follow', 'notify_reporter_on_resolution',
        'rls_auto_enable'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY triggers_to_revoke_auth
    LOOP
        FOR r IN 
            SELECT p.oid::regprocedure::text AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM authenticated, PUBLIC';
        END LOOP;
    END LOOP;
END $$;
