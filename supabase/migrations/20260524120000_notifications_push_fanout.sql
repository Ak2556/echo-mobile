-- Auto-fire the push-fanout edge function on every notifications insert.
--
-- Requires the `pg_net` extension (HTTP from Postgres) and a secret with
-- the project URL + service role key, both of which Supabase provides via
-- vault on the default Postgres instance.
--
-- The trigger is best-effort: errors in the HTTP call are swallowed so a
-- transient outage in the edge function never blocks the notification
-- insert that drives the in-app activity tab.

create extension if not exists pg_net with schema extensions;

create or replace function public.fanout_push_on_notification()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_project_url text;
  v_service_key text;
begin
  -- Pull from vault. If either is missing (e.g. local dev without push
  -- configured) bail without raising.
  begin
    select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  exception when others then
    return new;
  end;

  if v_project_url is null or v_service_key is null then
    return new;
  end if;

  perform extensions.http_post(
    url := v_project_url || '/functions/v1/push-fanout',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'user_id',     new.user_id,
      'type',        new.type,
      'target_id',   new.target_id,
      'target_kind', new.target_kind,
      'actor_id',    new.actor_id,
      'preview',     new.preview
    )
  );

  return new;
exception when others then
  -- Never block the notifications insert if pg_net hiccups.
  return new;
end $$;

drop trigger if exists trg_notifications_push_fanout on public.notifications;
create trigger trg_notifications_push_fanout
  after insert on public.notifications
  for each row execute function public.fanout_push_on_notification();
