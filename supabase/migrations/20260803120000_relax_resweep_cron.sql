-- Cost trim: the unmoderated-echo resweep is only a safety net for the rare case
-- where the moderate_new_echo AFTER INSERT trigger's pg_net enqueue fails
-- transiently. The trigger moderates immediately on insert, so the sweep almost
-- never has anything to do. Running it every 5 minutes (288 executions/day) is
-- needless background load — costly on a capped/free plan.
--
-- Every 30 minutes still gives a genuinely-stuck post ~4 retry attempts inside
-- its 3min–2h eligibility window, with 6x fewer idle runs.

do $$
begin
  perform cron.unschedule('resweep-unmoderated-echoes');
exception when others then null;
end $$;

select cron.schedule('resweep-unmoderated-echoes', '*/30 * * * *', $$select public.resweep_unmoderated_echoes();$$);
