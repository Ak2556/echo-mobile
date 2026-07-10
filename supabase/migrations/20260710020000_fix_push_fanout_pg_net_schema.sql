-- The push-fanout trigger called extensions.http_post, but on Supabase
-- pg_net installs its functions into the `net` schema (the daily-question
-- cron in this same repo correctly calls net.http_post). The call raised
-- "function does not exist" on every notification insert, the trigger's
-- catch-all exception handler swallowed it, and push notifications have
-- silently never fired.
--
-- Fix: search_path includes both net and extensions and the call is
-- unqualified, so it resolves in either layout. A probe NOTICE below
-- records where http_post actually lives at apply time.

DO $$
DECLARE
  v_schemas text;
BEGIN
  SELECT string_agg(n.nspname, ', ')
    INTO v_schemas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'http_post';
  RAISE NOTICE 'http_post found in schema(s): %', COALESCE(v_schemas, 'NONE — pg_net missing!');
END $$;

CREATE OR REPLACE FUNCTION public.fanout_push_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net, extensions AS $$
DECLARE
  v_project_url  text;
  v_service_key  text;
  v_fanout_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_project_url  FROM vault.decrypted_secrets WHERE name = 'project_url';
    SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    SELECT decrypted_secret INTO v_fanout_secret FROM vault.decrypted_secrets WHERE name = 'push_fanout_secret';
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF v_project_url IS NULL OR v_service_key IS NULL OR v_fanout_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM http_post(
    url     := v_project_url || '/functions/v1/push-fanout',
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'Authorization',       'Bearer ' || v_service_key,
      'x-push-fanout-secret', v_fanout_secret
    ),
    body    := jsonb_build_object(
      'user_id',     NEW.user_id,
      'type',        NEW.type,
      'target_id',   NEW.target_id,
      'target_kind', NEW.target_kind,
      'actor_id',    NEW.actor_id,
      'preview',     NEW.preview
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;
