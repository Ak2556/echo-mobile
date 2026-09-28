-- A heartbeat for an external dead-man's switch.
--
-- The GitHub healthcheck polls from outside, on a schedule GitHub runs on a
-- best-effort basis and switches off after 60 days without repository
-- activity, so monitoring stops exactly when the project goes quiet. It also
-- cannot notice the database itself going dark: a check that does not run
-- reports nothing.
--
-- This inverts it. Every five minutes, if cron_health() finds nothing wrong,
-- the database pings a URL. A monitor that expects that ping (healthchecks.io
-- is open source and self-hostable) alerts when it stops arriving, which
-- covers an unhealthy system, a stopped cron, a paused project and a dead
-- database alike.
--
-- Inert until configured:
--   select vault.create_secret('https://hc-ping.com/<uuid>', 'heartbeat_url');

begin;

create or replace function public.send_heartbeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'heartbeat_url';
  if v_url is null then
    return;
  end if;
  if (select unhealthy from public.cron_health()) = 0 then
    perform net.http_get(url := v_url);
  end if;
end;
$$;

revoke all on function public.send_heartbeat() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('heartbeat');
exception when others then null;
end $$;
select cron.schedule('heartbeat', '*/5 * * * *', $cron$select public.send_heartbeat();$cron$);

commit;
