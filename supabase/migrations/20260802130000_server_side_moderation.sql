-- Fix: the moderation gate was entirely client-dependent and fail-closed with no
-- recovery. New echoes default check_content=false (hidden from the feed) and are
-- only revealed when the client's fire-and-forget triggerEmbedEcho() call reaches
-- the embed-echo edge function. If the client goes offline / closes / the call
-- fails (the error was swallowed), the row stayed check_content=false FOREVER —
-- saved but permanently invisible, with nothing to recover it.
--
-- This makes moderation server-authoritative and self-healing (still fail-closed):
--   1. An AFTER INSERT trigger enqueues embed-echo via pg_net (async, non-blocking)
--      so moderation ALWAYS runs regardless of client state.
--   2. A cron sweeps any still-unmoderated rows and re-enqueues them, so a
--      transient failure can never leave a post hidden forever.
-- Mirrors the existing fanout_push_on_notification pg_net pattern.

create or replace function public.moderate_new_echo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_service_key text;
begin
  -- Pre-approved rows (e.g. AI-authored posts inserted with check_content=true)
  -- don't need moderation.
  if new.check_content is true then return new; end if;

  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_project_url is null or v_service_key is null then
    return new; -- can't enqueue now; the self-heal sweep will catch it
  end if;

  perform net.http_post(
    url     := v_project_url || '/functions/v1/embed-echo',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
    body    := jsonb_build_object('echo_id', new.id)
  );
  return new;
exception when others then
  -- Never block the insert on a failed enqueue; the sweep is the safety net.
  return new;
end;
$$;

drop trigger if exists trg_moderate_new_echo on public.public_echoes;
create trigger trg_moderate_new_echo
  after insert on public.public_echoes
  for each row execute function public.moderate_new_echo();

-- Self-heal: re-enqueue any row still unmoderated a few minutes after creation.
-- Bounded window (3m–2h) so a rejected post (check_content stays false by design)
-- isn't re-moderated forever, while a genuinely-stuck post recovers within minutes.
create or replace function public.resweep_unmoderated_echoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_service_key text;
  r record;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_project_url is null or v_service_key is null then return; end if;

  for r in
    select id from public.public_echoes
    where check_content = false
      and created_at < now() - interval '3 minutes'
      and created_at > now() - interval '2 hours'
    order by created_at desc
    limit 50
  loop
    perform net.http_post(
      url     := v_project_url || '/functions/v1/embed-echo',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body    := jsonb_build_object('echo_id', r.id)
    );
  end loop;
end;
$$;

do $$
begin
  perform cron.unschedule('resweep-unmoderated-echoes');
exception when others then null;
end $$;
select cron.schedule('resweep-unmoderated-echoes', '*/5 * * * *', $$select public.resweep_unmoderated_echoes();$$);
