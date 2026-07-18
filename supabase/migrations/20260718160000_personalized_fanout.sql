-- Personalized notifications — Stage 2b/2c (server-side).
--
-- Gated on profiles.personalized_notifications (the DSA opt-in from 2a): only
-- consented users are ever profiled or targeted here.
--
-- 2b: notification_profiles holds the *derived* model the device uploads
--     (best active UTC hours + top interest surface) — an aggregate, not a raw
--     event log, for data minimization.
-- 2c: an hourly pg_cron fires the `personalized-fanout` edge function, which
--     nudges each consented user at their own best hour with a reason matched
--     to their interest, inserting a notifications row → existing push-fanout.
--
-- Operator setup (NOT in this migration, by design):
--   supabase functions deploy personalized-fanout --no-verify-jwt
--   supabase secrets set PERSONALIZED_PUSH_SECRET=<a-long-random-string>
--   insert into vault.secrets (name, secret)
--     values ('personalized_push_secret', '<the-same-random-string>');

-- 2b — the per-user derived model (device uploads it when consented).
create table if not exists public.notification_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  best_hours    int[] not null default '{}',   -- UTC hours, most-active first
  top_surface   text,                          -- dm|daily|feed|chat|tools|marketplace|profile
  last_nudged_at timestamptz,                  -- server-side frequency cap
  updated_at    timestamptz not null default now()
);

alter table public.notification_profiles enable row level security;

-- Owner may read/write their own row; the cron uses the service role (bypasses RLS).
drop policy if exists "notification_profiles rw own" on public.notification_profiles;
create policy "notification_profiles rw own"
  on public.notification_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow the personal_nudge notification type (re-state the full CHECK).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'report_resolved', 'content_removed', 'daily_react',
    'personal_nudge'
  ));

-- 2c — hourly scheduler.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('personalized-fanout');
exception when others then null;
end $$;

-- Every hour on the hour (UTC). The edge function decides which consented
-- users' best_hours include the current hour.
select cron.schedule(
  'personalized-fanout',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := 'https://eyokhisijabitzjiydmz.supabase.co/functions/v1/personalized-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'personalized_push_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
