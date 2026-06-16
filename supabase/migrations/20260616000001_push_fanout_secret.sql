-- Push-fanout trigger: add shared-secret header so only the DB trigger
-- (not an arbitrary authenticated user) can fire push notifications.
--
-- Operator setup required BEFORE running this migration:
--   1. Generate a random secret:
--        openssl rand -hex 32
--   2. Set it as an edge function env var:
--        supabase secrets set PUSH_FANOUT_SECRET=<the-secret>
--   3. Store the SAME value in Vault:
--        insert into vault.secrets (name, secret)
--        values ('push_fanout_secret', '<the-secret>');
--      (Or via dashboard: Vault → New Secret)
--
-- If the Vault secret is missing the trigger bails early (best-effort), so
-- push notifications will not be sent until the secret is configured.

CREATE OR REPLACE FUNCTION public.fanout_push_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

  PERFORM extensions.http_post(
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

DROP TRIGGER IF EXISTS trg_notifications_push_fanout ON public.notifications;
CREATE TRIGGER trg_notifications_push_fanout
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fanout_push_on_notification();
