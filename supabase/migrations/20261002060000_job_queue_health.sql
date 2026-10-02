-- Queue health for the ops probe: depth and oldest job per pgmq queue.
--
-- 2026-10-02: the job layer (20260928110000) ran for three days with no
-- worker secret. jobs_kick() returns silently without it, so the every-minute
-- sweeper "succeeded" while every queue grew: 62 pushes undelivered since
-- Sep 29 and every new post stuck unmoderated, invisible in Latest. Nothing
-- looked at the queues themselves. ops-probe now calls this and alerts when
-- any queue's oldest job has waited over 10 minutes.
--
-- Read-only, and callable by the service role only: queue names and counts
-- are operational detail, not something a client needs.

create or replace function public.job_queue_health()
returns table (queue_name text, depth bigint, oldest_enqueued_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_queue text;
begin
  for v_queue in select m.queue_name from pgmq.meta m order by m.queue_name loop
    return query execute format(
      'select %L::text, count(*)::bigint, min(enqueued_at) from pgmq.%I',
      v_queue, pgmq.format_table_name(v_queue, 'q')
    );
  end loop;
end;
$$;

revoke all on function public.job_queue_health() from public, anon, authenticated;
grant execute on function public.job_queue_health() to service_role;
