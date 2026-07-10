-- Observability probe: both push pipelines bail SILENTLY when their Vault
-- secrets are missing (fanout_push_on_notification and the daily-question
-- cron each guard on vault.decrypted_secrets and return early). This block
-- reports at apply time which of the required secrets exist so a missing one
-- is a visible NOTICE instead of an invisible no-op. No data is changed and
-- no secret values are read into logs — names only.

DO $$
DECLARE
  v_name text;
  v_found boolean;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['project_url', 'service_role_key', 'push_fanout_secret', 'daily_push_secret']
  LOOP
    SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = v_name) INTO v_found;
    RAISE NOTICE 'vault secret %: %', v_name, CASE WHEN v_found THEN 'present' ELSE 'MISSING' END;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'vault probe failed: %', SQLERRM;
END $$;
