-- Everything a restored database needs that is neither schema nor content: queues and cron jobs.
-- Taken from production on 2026-10-16. Idempotent: safe to run twice.
-- Contains NO secrets. Cron jobs read them from the vault by name (checked at the end).

-- pgmq queues (the triggers on posts, follows, notifications and DMs send into these).
select pgmq.create('push');
select pgmq.create('moderation');
select pgmq.create('dlq');
select pgmq.create('entitlements');
select pgmq.create('media_gc');
select pgmq.create('broadcast');
select pgmq.create('verification');
select pgmq.create('erasure');
select pgmq.create('media_moderation');
select pgmq.create('post_fanout');

-- pg_cron jobs. Each is unscheduled first so a rerun replaces instead of duplicating.
select cron.unschedule(jobid) from cron.job where jobname = 'rules-reminder';
select cron.schedule('rules-reminder', '30 5 * * *', $cmd$select public.send_due_rules_reminders();$cmd$);
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'rules-reminder';  -- inactive on prod (2026-10-16)
select cron.unschedule(jobid) from cron.job where jobname = 'ops-probe';
select cron.schedule('ops-probe', '*/30 * * * *', $cmd$select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ops-probe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-ops-probe-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_probe_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'purge-operational-logs';
select cron.schedule('purge-operational-logs', '10 4 * * *', $cmd$select public.purge_operational_logs();$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'refresh_trending_echoes';
select cron.schedule('refresh_trending_echoes', '*/15 * * * *', $cmd$refresh materialized view concurrently public.trending_echoes_mv;$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'jobs-sweeper';
select cron.schedule('jobs-sweeper', '* * * * *', $cmd$select public.jobs_sweep();$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'daily-question-push';
select cron.schedule('daily-question-push', '30 13 * * *', $cmd$select public.claim_daily_broadcast();$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'personalized-fanout';
select cron.schedule('personalized-fanout', '0 * * * *', $cmd$select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/personalized-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'personalized_push_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'heartbeat';
select cron.schedule('heartbeat', '*/5 * * * *', $cmd$select public.send_heartbeat();$cmd$);
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-ranks';
select cron.schedule('refresh-ranks', '7 * * * *', $cmd$select public.refresh_ranks();$cmd$);

-- Vault secrets the cron jobs and triggers read by name. Values are NOT stored anywhere in the repo:
-- create each with  select vault.create_secret('<value>', '<name>');  (see README).
-- heartbeat_url is the dead-man's-switch ping (send_heartbeat() does nothing without it). It was
-- MISSING on production when this was written, 2026-10-16.
do $$
declare missing text;
begin
  select string_agg(n, ', ') into missing from unnest(array['project_url','push_fanout_secret','daily_push_secret','personalized_push_secret','service_role_key','embed_echo_secret','ops_probe_secret','worker_secret','heartbeat_url']) n
    where not exists (select 1 from vault.secrets s where s.name = n);
  if missing is not null then
    raise warning 'vault secrets still to create: %', missing;
  end if;
end $$;
