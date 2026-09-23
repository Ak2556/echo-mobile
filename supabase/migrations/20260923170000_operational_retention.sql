-- Keep only the operational rows something still reads.
--
-- Measured on production, 2026-09-23. The database is 30 MB, so this is not
-- about disk running out — it is about rows kept for ever:
--
--   cron.job_run_details   15,016 rows, 3.7 MB, never purged. That is 12% of
--                          the database, and one row per cron run for ever, at
--                          roughly 400 rows a day.
--   net._http_response     read by cron_health over a 2 hour window only.
--   probe_runs             read by the ops probe over its last few runs only.
--   echo_views             read by the feed over a 90 day window only.
--   notifications          read and dismissed rows nobody scrolls back to.
--
-- Retention runs once a day rather than on every write, so the cost is one
-- bounded pass at a quiet hour. Each window is set to match what actually
-- reads that table, and unread notifications are never removed whatever their
-- age: nobody's unread inbox disappears on a timer.

begin;

create or replace function public.purge_operational_logs()
returns table (what text, removed bigint)
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  v_count bigint;
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics v_count = row_count;
  what := 'cron.job_run_details'; removed := v_count; return next;

  delete from net._http_response where created < now() - interval '6 hours';
  get diagnostics v_count = row_count;
  what := 'net._http_response'; removed := v_count; return next;

  delete from public.probe_runs where ran_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  what := 'probe_runs'; removed := v_count; return next;

  delete from public.echo_views where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  what := 'echo_views'; removed := v_count; return next;

  delete from public.notifications
   where created_at < now() - interval '90 days'
     and (read_at is not null or dismissed_at is not null);
  get diagnostics v_count = row_count;
  what := 'notifications'; removed := v_count; return next;
end;
$$;

comment on function public.purge_operational_logs() is
  'Daily retention for rows nothing reads any more. Returns what it removed, so a run can be inspected.';

revoke all on function public.purge_operational_logs() from public, anon, authenticated;

select cron.schedule('purge-operational-logs', '10 4 * * *', $cron$select public.purge_operational_logs();$cron$);

commit;
