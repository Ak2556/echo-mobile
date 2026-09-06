-- Scheduled-job health for the external healthcheck.
--
-- Deliberately does not trust pg_cron on its own. cron.job_run_details records
-- whether the scheduled SQL ran, not whether the work happened:
-- personalized-fanout reported 'succeeded' for weeks while doing nothing,
-- because the job fired correctly and the HTTP call it makes failed downstream
-- on a missing Vault secret. So this checks both — the job succeeded recently,
-- AND pg_net has no recent failing responses.
--
-- Returns a count and a short description rather than the rows themselves,
-- because it is granted to anon so GitHub Actions can call it with the
-- publishable key. Job names and staleness are all an unauthenticated caller
-- learns; no payloads, no URLs, no secrets.
create or replace function public.cron_health()
returns table (unhealthy integer, detail text)
language sql
security definer
set search_path = public, cron, net
as $$
  with expected as (
    -- Each job's tolerated gap is its schedule plus slack, so a single missed
    -- run does not page anyone but a stopped job does.
    select * from (values
      ('daily-question-push',        interval '25 hours'),
      ('personalized-fanout',        interval '2 hours'),
      ('resweep-unmoderated-echoes', interval '90 minutes'),
      ('refresh_trending_echoes',    interval '15 minutes')
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
  )
  select
    ((select count(*) from stale where problem is not null)
      + (select case when failures > 0 then 1 else 0 end from http))::int,
    coalesce(
      nullif(concat_ws('; ',
        (select string_agg(problem, '; ') from stale where problem is not null),
        (select case when failures > 0
                then failures || ' failing pg_net responses in 2h' end from http)
      ), ''),
      'all scheduled jobs healthy');
$$;

revoke all on function public.cron_health() from public;
grant execute on function public.cron_health() to anon, authenticated;

comment on function public.cron_health() is
  'Scheduled-job health for the external healthcheck. Checks that jobs ran AND that pg_net calls succeeded — pg_cron reports success for a job that did nothing.';
