-- Reschedule daily-question-push against the currently linked production
-- project. The original cron migration pointed at an older project ref, which
-- meant the job could call the wrong Edge Function even when the app and EAS
-- env were configured for the current Supabase project.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('daily-question-push');
exception
  when others then null;
end $$;

select cron.schedule(
  'daily-question-push',
  '30 13 * * *',
  $cron$
  select net.http_post(
    url := 'https://eyokhisijabitzjiydmz.supabase.co/functions/v1/daily-question-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_push_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
