-- Fix Function Search Path Mutable warnings
DO $$
DECLARE
    r record;
    functions_to_fix text[] := ARRAY[
        'ai_touch_conversation', 
        'set_marketplace_updated_at', 
        'touch_habit_updated_at', 
        'habit_stats', 
        'fitness_stats', 
        'expense_stats', 
        'task_stats', 
        'target_progress'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY functions_to_fix
    LOOP
        FOR r IN 
            SELECT p.oid::regprocedure::text AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE 'ALTER FUNCTION ' || r.sig || ' SET search_path = ''''';
        END LOOP;
    END LOOP;
END $$;

-- Move extensions to extensions schema to fix extension_in_public warning
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
EXCEPTION WHEN OTHERS THEN
    -- Ignore if extension doesn't exist or already in extensions schema
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
EXCEPTION WHEN OTHERS THEN
    -- Ignore if extension doesn't exist or already in extensions schema
END $$;

-- Fix Public Bucket Allows Listing warnings
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "marketplace_public_read" ON storage.objects;
-- Replace with proper GET-only access if needed, though public buckets allow GET without SELECT policies on storage.objects

-- Fix SECURITY DEFINER warnings for trigger functions (they should not be executable by roles)
DO $$
DECLARE
    r record;
    triggers_to_fix text[] := ARRAY[
        'adjust_comment_likes_count',
        'adjust_comment_reaction_count',
        'adjust_echo_comment_count',
        'adjust_echo_likes_count',
        'adjust_echo_reaction_count',
        'adjust_salon_members_count',
        'decrement_comment_reply_count',
        'handle_new_user',
        'increment_comment_reply_count',
        'update_bookmark_count',
        'update_profiles_updated_at',
        'update_user_follower_counts'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY triggers_to_fix
    LOOP
        FOR r IN 
            SELECT p.oid::regprocedure::text AS sig
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM PUBLIC, anon, authenticated';
        END LOOP;
    END LOOP;
END $$;

-- Fix SECURITY DEFINER warnings for RPCs by revoking anon access if they are only for authenticated users
-- (If they are meant for authenticated only, revoke from anon. If they are admin only, revoke from authenticated too)
DO $$
DECLARE
    r record;
    rpcs_to_restrict_from_anon text[] := ARRAY[
        'add_group_members',
        'add_salon_owner_as_member',
        'get_or_create_dm_conversation',
        'mark_daily_question_viewed',
        'record_daily_answer',
        'record_daily_question_reaction',
        'record_feed_view',
        'record_post_impression',
        'record_push_receipt',
        'record_search_query',
        'record_user_interaction',
        'report_echo',
        'review_report',
        'add_moderator',
        'remove_moderator'
    ];
    func_name text;
BEGIN
    FOREACH func_name IN ARRAY rpcs_to_restrict_from_anon
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
