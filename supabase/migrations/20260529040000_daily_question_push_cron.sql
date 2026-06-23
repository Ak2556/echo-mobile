-- Daily-question push scheduler.
--
-- Fires the `daily-question-push` edge function once a day so every user with a
-- registered push token gets nudged to answer today's question. This is the
-- trigger half of the retention loop (the device half — token registration +
-- tap routing — already exists).
--
-- One-time setup the operator must do (NOT in this migration, by design)
--   1. Deploy the function:
--        supabase functions deploy daily-question-push --no-verify-jwt
--   2. Give the function its gate secret:
--        supabase secrets set DAILY_PUSH_SECRET=<a-long-random-string>
--   3. Store the SAME secret in Vault so the cron below can read it without
--      hard-coding it in version-controlled SQL:
--        insert into vault.secrets (name, secret)
--        values ('daily_push_secret', '<the-same-random-string>');
--
-- Re-running this migration is safe: the job is unscheduled first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any prior copy of the job so this migration is idempotent across the
-- pg_cron versions where cron.schedule does not upsert by name.
do $$
begin
  perform cron.unschedule('daily-question-push');
exception
  when others then null; -- no such job yet — fine
end $$;

-- 13:30 UTC = 19:00 IST — an evening engagement window. Adjust the cron
-- expression if your user base skews to another timezone.
select cron.schedule(
  'daily-question-push',
  '30 13 * * *',
  $cron$
  select net.http_post(
    url := 'https://xmjbhcyyqrjlvhluisfj.supabase.co/functions/v1/daily-question-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_push_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
