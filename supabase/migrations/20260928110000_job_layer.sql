-- Durable jobs for work the database hands to an edge function.
--
-- Pushes and moderation were dispatched with a bare net.http_post from a
-- trigger, inside `exception when others then return new`. A failed call left
-- a row in net._http_response, which is purged after six hours, and nothing
-- retried it: a push lost during a provider outage was lost for good, and a
-- post whose moderation call failed stayed hidden unless a time-windowed
-- sweep (3 minutes to 2 hours old, 50 at a time) happened to catch it.
--
-- Now a trigger enqueues a job in pgmq inside its own transaction, so the job
-- exists exactly when the row does. After commit, pg_net "kicks" the worker
-- edge function, which claims jobs with a visibility timeout:
--
--   done           -> deleted
--   failed         -> invisible for 30s, 60s, 120s ... then claimed again
--   failed 6 times -> archived and copied to the 'dlq' queue
--
-- A crashed worker loses nothing: the claim lapses and the sweeper, once a
-- minute, kicks any queue holding a claimable job. cron_health reports
-- dead-lettered jobs and jobs nobody has claimed, and the GitHub healthcheck
-- inherits both, so a failure is visible instead of silent.
--
-- Operator setup (values never committed), before the worker can drain:
--   supabase secrets set WORKER_SECRET=<value>
--   supabase functions deploy worker            (verify_jwt = false, config.toml)
--   select vault.create_secret('<value>', 'worker_secret');
-- Until then jobs wait in their queues and nothing is lost.

begin;

create extension if not exists pgmq;

select pgmq.create(q) from unnest(array['push', 'moderation', 'dlq']) as q;

-- ── kick ────────────────────────────────────────────────────────────────────
-- Best effort by design: a kick only shortens the wait, the sweeper drains
-- regardless. It is the one step whose failure is swallowed.
create or replace function public.jobs_kick(p_queue text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body    := jsonb_build_object('queue', p_queue)
  );
exception when others then
  raise warning 'jobs_kick(%) failed: %', p_queue, sqlerrm;
end;
$$;

-- ── enqueue ─────────────────────────────────────────────────────────────────
-- Not swallowed: pgmq.send is an insert into a local table, and if it fails the
-- caller's write should fail with it rather than commit without its job.
create or replace function public.jobs_enqueue(p_queue text, p_msg jsonb, p_delay integer default 0)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  select * into v_id from pgmq.send(p_queue, p_msg, p_delay);
  if p_delay = 0 then
    perform public.jobs_kick(p_queue);
  end if;
  return v_id;
end;
$$;

-- ── worker API (service role only) ─────────────────────────────────────────
create or replace function public.jobs_claim(p_queue text, p_n integer, p_vt integer)
returns setof pgmq.message_record
language sql
security definer
set search_path = ''
as $$
  select * from pgmq.read(p_queue, p_vt, p_n);
$$;

create or replace function public.jobs_ack(p_queue text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.delete(p_queue, p_id);
end;
$$;

create or replace function public.jobs_retry(p_queue text, p_id bigint, p_delay integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.set_vt(p_queue, p_id, greatest(p_delay, 1));
end;
$$;

create or replace function public.jobs_dead(p_queue text, p_id bigint, p_msg jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', p_queue, 'kind', 'failed', 'msg', p_msg, 'error', left(p_error, 2000), 'at', now()));
  perform pgmq.archive(p_queue, p_id);
end;
$$;

-- A job that finished but left something an operator should see (a push some
-- devices received and others refused). Recorded without failing the job.
create or replace function public.jobs_report(p_queue text, p_msg jsonb, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', p_queue, 'kind', 'report', 'msg', p_msg, 'error', left(p_error, 2000), 'at', now()));
end;
$$;

-- ── sweeper ─────────────────────────────────────────────────────────────────
-- Kicks only queues holding a job that is claimable now, so an idle system
-- sends nothing and a job in backoff is left alone until its time comes.
create or replace function public.jobs_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue text;
  v_ready boolean;
begin
  for v_queue in select queue_name from pgmq.meta where queue_name <> 'dlq' loop
    execute format('select exists (select 1 from pgmq.%I where vt <= clock_timestamp())',
                   pgmq.format_table_name(v_queue, 'q'))
      into v_ready;
    if v_ready then
      perform public.jobs_kick(v_queue);
    end if;
  end loop;
end;
$$;

-- What cron_health reports about the queues: dead letters, and jobs that have
-- been claimable for 15 minutes without anyone claiming them (the worker is
-- not deployed, its secret is missing, or it is failing before it claims).
create or replace function public.jobs_health()
returns table (problem text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue text;
  v_waiting bigint;
begin
  select count(*) into v_waiting from pgmq.q_dlq;
  if v_waiting > 0 then
    problem := v_waiting || ' job(s) in the dead-letter queue'; return next;
  end if;
  for v_queue in select queue_name from pgmq.meta where queue_name <> 'dlq' loop
    execute format('select count(*) from pgmq.%I where vt <= clock_timestamp() - interval ''15 minutes''',
                   pgmq.format_table_name(v_queue, 'q'))
      into v_waiting;
    if v_waiting > 0 then
      problem := v_queue || ': ' || v_waiting || ' job(s) unclaimed for 15 minutes'; return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.jobs_kick(text) from public, anon, authenticated;
revoke all on function public.jobs_enqueue(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.jobs_claim(text, integer, integer) from public, anon, authenticated;
revoke all on function public.jobs_ack(text, bigint) from public, anon, authenticated;
revoke all on function public.jobs_retry(text, bigint, integer) from public, anon, authenticated;
revoke all on function public.jobs_dead(text, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.jobs_report(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.jobs_sweep() from public, anon, authenticated;
revoke all on function public.jobs_health() from public, anon, authenticated;
grant execute on function public.jobs_claim(text, integer, integer) to service_role;
grant execute on function public.jobs_ack(text, bigint) to service_role;
grant execute on function public.jobs_retry(text, bigint, integer) to service_role;
grant execute on function public.jobs_dead(text, bigint, jsonb, text) to service_role;
grant execute on function public.jobs_report(text, jsonb, text) to service_role;

do $$
begin
  perform cron.unschedule('jobs-sweeper');
exception when others then null;
end $$;
select cron.schedule('jobs-sweeper', '* * * * *', $cron$select public.jobs_sweep();$cron$);

-- ── producers ───────────────────────────────────────────────────────────────
-- The job carries only the row's id. The worker reads the row when it runs, so
-- a retry delivers what the row says then, and a deleted row is a no-op.
create or replace function public.fanout_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.jobs_enqueue('push', jsonb_build_object('notification_id', new.id));
  return new;
end;
$$;

-- Pre-approved rows (AI-authored posts inserted with check_content = true)
-- need no moderation. Edits reset check_content to false before this runs.
create or replace function public.moderate_new_echo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.check_content is true then
    return new;
  end if;
  perform public.jobs_enqueue('moderation', jsonb_build_object('echo_id', new.id));
  return new;
end;
$$;

revoke all on function public.fanout_push_on_notification() from public, anon, authenticated;
revoke all on function public.moderate_new_echo() from public, anon, authenticated;

-- The time-windowed resweep is replaced by queue retries. Its window gave up on
-- a post two hours after it was published; a job retries until it succeeds or
-- is dead-lettered where someone will see it.
do $$
begin
  perform cron.unschedule('resweep-unmoderated-echoes');
exception when others then null;
end $$;
drop function if exists public.resweep_unmoderated_echoes();

-- Posts left waiting by the old path, including any the resweep window had
-- already given up on. One kick for the batch; the worker drains it.
select pgmq.send('moderation', jsonb_build_object('echo_id', id))
  from public.public_echoes
 where check_content = false
   and moderated_at is null
   and created_at > now() - interval '30 days';
select public.jobs_kick('moderation');

-- ── health ──────────────────────────────────────────────────────────────────
-- As 20260923120000, with the retired resweep job replaced by the sweeper and
-- the queue checks added.
create or replace function public.cron_health()
returns table (unhealthy integer, detail text)
language sql
security definer
set search_path = public, cron, net
as $$
  with expected as (
    select * from (values
      ('daily-question-push',     interval '25 hours'),
      ('personalized-fanout',     interval '2 hours'),
      ('refresh_trending_echoes', interval '15 minutes'),
      ('ops-probe',               interval '90 minutes'),
      ('jobs-sweeper',            interval '10 minutes')
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
  ),
  jobs as (
    select string_agg(problem, '; ') as problem, count(*) as failing
    from public.jobs_health()
  )
  select
    ((select count(*) from stale where problem is not null)
      + (select case when failures > 0 then 1 else 0 end from http)
      + (select case when failing > 0 then 1 else 0 end from probes)
      + (select case when failing > 0 then 1 else 0 end from jobs))::int,
    coalesce(
      nullif(concat_ws('; ',
        (select string_agg(problem, '; ') from stale where problem is not null),
        (select case when failures > 0
                then failures || ' failing pg_net responses in 2h' end from http),
        (select problem from probes),
        (select problem from jobs)
      ), ''),
      'all scheduled jobs healthy');
$$;

commit;
