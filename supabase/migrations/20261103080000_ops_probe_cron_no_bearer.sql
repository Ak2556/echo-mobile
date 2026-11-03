-- The ops-probe cron stopped reaching its function on 2026-11-02 23:30 UTC.
--
-- Its command sent the Vault `service_role_key` as a bearer token. That is a
-- legacy API key, and Supabase now answers it with 401 "Legacy API keys are
-- disabled" before the function runs. Turning verify_jwt off (config.toml) did
-- not help: the gateway still recognises and rejects a real disabled key even
-- when it is not asked to verify one. Every run since returned 401, so the probe
-- that exists to notice silent failures was itself silent.
--
-- The function authenticates the caller with x-ops-probe-secret alone
-- (constant-time compare, 403 otherwise), so the bearer was never needed once
-- verify_jwt was off. Drop it.
--
-- alter_job, not unschedule + schedule: the job keeps its id, and so its run
-- history, which cron_health() reads to decide whether ops-probe is stale. A new
-- id would report "never succeeded" until the first run.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ops-probe') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'ops-probe'),
      command := $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ops-probe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ops-probe-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_probe_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
    );
  end if;
end
$$;
