-- Retention for rows that were kept for ever with nothing reading them.
--
-- As 20260923170000, plus:
--   subscription_webhook_events  every RevenueCat event, full payload. The
--                                sync reads RevenueCat itself, so these are
--                                only an audit trail; 90 days covers disputes
--                                a store would still accept.
--   ad_events                    one row per user, ad, kind and day, used to
--                                deduplicate within the day. Old days
--                                deduplicate nothing.
--   ai_tool_calls                confirm cards nobody answered stay
--                                'pending_confirm' for ever; a day later they
--                                are expired, not deleted (the chat shows them).
--   pgmq archives                completed dead letters and archived jobs.
--
-- payment_events is kept: payment records have a legal retention period that
-- is longer than anything here.

begin;

create or replace function public.purge_operational_logs()
returns table (what text, removed bigint)
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  v_count bigint;
  v_queue text;
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

  delete from public.subscription_webhook_events where received_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  what := 'subscription_webhook_events'; removed := v_count; return next;

  delete from public.ad_events where day < current_date - 180;
  get diagnostics v_count = row_count;
  what := 'ad_events'; removed := v_count; return next;

  update public.ai_tool_calls
     set status = 'failed', error = 'expired: not confirmed within a day'
   where status = 'pending_confirm'
     and created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  what := 'ai_tool_calls expired'; removed := v_count; return next;

  -- Archived jobs. The live dlq queue is never purged here: it is the alarm,
  -- and is cleared by whoever reads it (docs/runbook/monitoring.md).
  for v_queue in select queue_name from pgmq.meta loop
    execute format('delete from pgmq.%I where archived_at < now() - interval ''14 days''',
                   pgmq.format_table_name(v_queue, 'a'));
    get diagnostics v_count = row_count;
    what := 'pgmq archive ' || v_queue; removed := v_count; return next;
  end loop;
end;
$$;

revoke all on function public.purge_operational_logs() from public, anon, authenticated;

commit;
