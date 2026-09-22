-- Server-side moderation: authenticate to embed-echo with a shared secret.
--
-- moderate_new_echo and resweep_unmoderated_echoes proved themselves to
-- embed-echo with the Vault `service_role_key`, a legacy JWT. The project's
-- legacy API keys were disabled on 2026-08-21, so the auth server has rejected
-- that key ever since. The gateway still passes it (its signature is valid),
-- which made the failure a quiet 401 inside the function: no post has been
-- revealed server-side since. Posts appeared only when the author's app stayed
-- open long enough to run the client fallback.
--
-- Both now send x-embed-echo-secret from Vault `embed_echo_secret`, matched
-- against the function's EMBED_ECHO_SECRET — the pattern push-fanout already
-- uses. Authorization still carries the Vault key, only to satisfy the gateway.
--
-- The resweep window grows from 2 hours to 24, so a post that misses one
-- outage is still picked up later instead of staying hidden for good.
--
-- Operator setup (not in this file, values never committed):
--   supabase secrets set EMBED_ECHO_SECRET=<value>
--   select vault.create_secret('<value>', 'embed_echo_secret');

create or replace function public.moderate_new_echo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_service_key text;
  v_secret text;
begin
  -- Pre-approved rows (e.g. AI-authored posts inserted with check_content=true)
  -- don't need moderation.
  if new.check_content is true then return new; end if;

  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'embed_echo_secret';
  if v_project_url is null or v_service_key is null or v_secret is null then
    return new; -- can't enqueue now; the self-heal sweep will catch it
  end if;

  perform net.http_post(
    url     := v_project_url || '/functions/v1/embed-echo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'x-embed-echo-secret', v_secret
    ),
    body    := jsonb_build_object('echo_id', new.id)
  );
  return new;
exception when others then
  -- Never block the insert on a failed enqueue; the sweep is the safety net.
  return new;
end;
$$;

create or replace function public.resweep_unmoderated_echoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_url text;
  v_service_key text;
  v_secret text;
  r record;
begin
  select decrypted_secret into v_project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'embed_echo_secret';
  if v_project_url is null or v_service_key is null or v_secret is null then return; end if;

  for r in
    select id from public.public_echoes
    where check_content = false
      and created_at < now() - interval '3 minutes'
      and created_at > now() - interval '24 hours'
    order by created_at desc
    limit 50
  loop
    perform net.http_post(
      url     := v_project_url || '/functions/v1/embed-echo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key,
        'x-embed-echo-secret', v_secret
      ),
      body    := jsonb_build_object('echo_id', r.id)
    );
  end loop;
end;
$$;

-- create or replace keeps existing grants; restate the lockdown from
-- 20260916120000_security_hardening so this file stands on its own.
revoke execute on function public.resweep_unmoderated_echoes() from public, anon, authenticated;
