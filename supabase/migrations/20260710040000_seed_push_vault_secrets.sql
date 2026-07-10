-- Seed the Vault secrets both push pipelines require (project_url,
-- service_role_key, push_fanout_secret, daily_push_secret).
--
-- The REAL values were injected at deploy time on 2026-07-10 and live only in
-- Vault + edge function secrets — this committed copy is a sanitized
-- placeholder so credentials never enter git history. The guards make it a
-- safe no-op anywhere the secrets already exist; on a FRESH environment,
-- seed Vault manually per docs/go-live-checklist.md before relying on push.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    RAISE NOTICE 'project_url missing from Vault — seed it manually (see file header)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    RAISE NOTICE 'service_role_key missing from Vault — seed it manually';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_fanout_secret') THEN
    RAISE NOTICE 'push_fanout_secret missing from Vault — seed it manually';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'daily_push_secret') THEN
    RAISE NOTICE 'daily_push_secret missing from Vault — seed it manually';
  END IF;
END $$;
