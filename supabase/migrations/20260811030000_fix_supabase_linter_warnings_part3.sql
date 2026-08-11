-- Revoke PUBLIC and anon execute for all flagged RPCs to fix anon_security_definer_function_executable
DO $$
DECLARE
    r record;
    funcs_to_revoke_public text[] := ARRAY[
        'add_group_members', 'add_salon_owner_as_member', 'adjust_echo_remix_count',
        'adjust_echo_repost_count', 'adjust_echo_view_count', 'adjust_follower_count',
        'adjust_oh_question_upvote_count', 'adjust_oh_rsvp_count', 'adjust_salon_echo_count',
        'adjust_salon_member_count', 'assert_group_admin', 'bump_quote_repost_count',
        'check_app_rate_limit', 'create_group_conversation', 'delete_account',
        'enforce_insert_rate_limit', 'enforce_profile_update_rate_limit', 'ensure_daily_question',
        'following_fitness_leaderboard', 'following_habit_leaderboard', 'get_divergent_daily_answers',
        'get_dm_conversations', 'get_group_members', 'get_or_create_dm_conversation',
        'get_ranked_feed', 'get_remix_tree', 'get_semantic_feed', 'get_similar_echoes',
        'get_thinking_partners', 'get_trending_evolutions', 'is_dm_conversation_member',
        'leave_group', 'moderate_new_echo', 'moderator_remove_echo', 'remove_group_member',
        'restore_content_on_overturned_appeal', 'resweep_unmoderated_echoes',
        'set_group_member_role', 'update_group_meta'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY funcs_to_revoke_public
    LOOP
        FOR r IN 
            SELECT p.oid::regprocedure::text AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM PUBLIC, anon';
        END LOOP;
    END LOOP;
END $$;
