-- cron_health() was callable by anyone, signed in or not, and returned the name
-- of every scheduled job, when it last succeeded, how many HTTP calls failed and
-- the text of the probe's last errors. That is a map of what to attack and when
-- it is least likely to be noticed.
--
-- The GitHub healthcheck calls it with the anon key and reads only `unhealthy`,
-- so the count stays callable by everyone. The detail text is now returned only
-- to callers that are not an end user: the service role, and a direct SQL session
-- (the editor, the CLI, pg_cron), which is how the owner reads it.
--
-- The real work moves to cron_health_full(), executable by the service role only;
-- cron_health() keeps its name and columns, so the heartbeat job, the healthcheck
-- and the audit script need no change.

do $$
begin
  if to_regprocedure('public.cron_health_full()') is null then
    alter function public.cron_health() rename to cron_health_full;
  end if;
end $$;

revoke all on function public.cron_health_full() from public, anon, authenticated;
grant execute on function public.cron_health_full() to service_role;

create or replace function public.cron_health()
returns table(unhealthy integer, detail text)
language sql
security definer
set search_path = public
as $$
  select f.unhealthy,
         case
           when coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
                in ('anon', 'authenticated')
           then null
           else f.detail
         end
    from public.cron_health_full() f
$$;

revoke all on function public.cron_health() from public;
grant execute on function public.cron_health() to anon, authenticated, service_role;
