-- Ops probe: check the outcome, not the machine.
--
-- cron_health passes when every job ran recently and pg_net logged no 4xx in
-- the last two hours. Server-side moderation was dead from 2026-08-21 to
-- 2026-09-22 and every check stayed green, because a path that is never called
-- never fails: with little traffic, nothing asked the broken function anything.
--
-- The ops-probe function runs a real classification and counts posts left
-- without a verdict, then pushes to the moderators' devices when either fails.
-- This file gives it the three things it needs from the database:
--
--   1. public_echoes.moderated_at — so a post awaiting a verdict can be told
--      apart from one that was judged and correctly hidden. Without it, every
--      flagged post looks stuck for ever.
--   2. probe_runs — the history the probe reads to decide whether a failure is
--      new, and the record that shows how long a break lasted.
--   3. a schedule, plus the same failure surfaced through cron_health so the
--      existing GitHub healthcheck inherits it.
--
-- Operator setup (values never committed):
--   supabase secrets set OPS_PROBE_SECRET=<value>
--   select vault.create_secret('<value>', 'ops_probe_secret');

begin;

-- ── 1. when a verdict was reached ───────────────────────────────────────────
alter table public.public_echoes add column if not exists moderated_at timestamptz;

comment on column public.public_echoes.moderated_at is
  'When a moderation verdict was recorded, whatever the verdict. Null plus check_content = false means still waiting, which is what the ops probe counts.';

-- Everything already hidden has been judged; without this backfill the probe
-- would report the existing flagged post as stuck for ever.
update public.public_echoes
   set moderated_at = coalesce(moderated_at, now())
 where check_content = false
   and moderated_at is null;

-- ── 2. probe history ────────────────────────────────────────────────────────
create table if not exists public.probe_runs (
  id         bigserial primary key,
  ran_at     timestamptz not null default now(),
  check_name text        not null,
  ok         boolean     not null,
  detail     text,
  alerted    boolean     not null default false
);

create index if not exists idx_probe_runs_check_time
  on public.probe_runs (check_name, ran_at desc);

comment on table public.probe_runs is
  'One row per check per probe run. Server-only: the probe writes it with the service key.';

alter table public.probe_runs enable row level security;
revoke all on public.probe_runs from anon, authenticated;
revoke all on sequence public.probe_runs_id_seq from anon, authenticated;

-- ── 3. schedule ─────────────────────────────────────────────────────────────
-- Every 30 minutes: often enough that a break is caught within half an hour,
-- rare enough that 48 classifications a day do not eat the model quota the
-- probe exists to protect.
select cron.schedule(
  'ops-probe',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ops-probe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-ops-probe-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_probe_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);

-- ── 4. let the existing healthcheck see probe failures ──────────────────────
create or replace function public.cron_health()
returns table (unhealthy integer, detail text)
language sql
security definer
set search_path = public, cron, net
as $$
  with expected as (
    select * from (values
      ('daily-question-push',        interval '25 hours'),
      ('personalized-fanout',        interval '2 hours'),
      ('resweep-unmoderated-echoes', interval '90 minutes'),
      ('refresh_trending_echoes',    interval '15 minutes'),
      ('ops-probe',                  interval '90 minutes')
    ) as t(jobname, max_gap)
  ),
  last_ok as (
    select j.jobname,
           max(d.end_time) filter (where d.status = 'succeeded') as ok_at
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
    where j.active
    group by j.jobname
  ),
  stale as (
    select case
             when l.jobname is null then e.jobname || ': not scheduled'
             when l.ok_at is null   then e.jobname || ': never succeeded'
             when now() - l.ok_at > e.max_gap
               then e.jobname || ': last success ' || age(now(), l.ok_at)
           end as problem
    from expected e
    left join last_ok l on l.jobname = e.jobname
  ),
  http as (
    select count(*) as failures
    from net._http_response
    where created > now() - interval '2 hours'
      and (status_code is null or status_code >= 400)
  ),
  -- The outcome checks. A job that ran and reported a broken system is still a
  -- broken system, which is the whole point of the probe.
  probes as (
    select string_agg(distinct r.check_name || ': ' || r.detail, '; ') as problem,
           count(*) as failing
    from public.probe_runs r
    join (
      select check_name, max(ran_at) as ran_at
        from public.probe_runs
       group by check_name
    ) latest on latest.check_name = r.check_name and latest.ran_at = r.ran_at
    where not r.ok
      and r.ran_at > now() - interval '3 hours'
  )
  select
    ((select count(*) from stale where problem is not null)
      + (select case when failures > 0 then 1 else 0 end from http)
      + (select case when failing > 0 then 1 else 0 end from probes))::int,
    coalesce(
      nullif(concat_ws('; ',
        (select string_agg(problem, '; ') from stale where problem is not null),
        (select case when failures > 0
                then failures || ' failing pg_net responses in 2h' end from http),
        (select problem from probes)
      ), ''),
      'all scheduled jobs healthy');
$$;

commit;
