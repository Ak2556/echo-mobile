-- Media on an echo must come from Echo.
--
-- public_echoes.media_urls is a bare text[] that `authenticated` may INSERT and
-- UPDATE, with no validation anywhere in 156 migrations. hls_url is the same
-- shape. So the URL attached to a post is simply whatever the client said, and
-- three things follow:
--
--   1. Moderation becomes a point-in-time opinion about bytes the author still
--      controls. check_content is decided once, on fetch, against a remote host
--      the poster owns; afterwards they change what that URL serves. The post
--      stays "moderated" and now shows something else. The whole moderation
--      gate (20260529000000, and §2/§3 of 20260916120000) assumes the media it
--      judged is the media that will be served.
--   2. supabase/functions/og-redirect puts media_urls[0] straight into
--      <meta property="og:image">, so an attacker-chosen, mutable image is
--      served under our own OG tags when the link is unfurled in Slack,
--      iMessage or WhatsApp. The escaping there is correct; the provenance is
--      not.
--   3. Every viewer's IP, and a timestamp of when they looked, is handed to a
--      third-party host of the author's choosing. That is a tracking pixel in
--      a feed post.
--
-- Fixed as an allowlist of hosts rather than a CHECK with a literal domain,
-- because the media host is deployment configuration
-- (EXPO_PUBLIC_CLOUDFLARE_WORKER_URL, and the worker redeploys itself from
-- main): adding a host must be an INSERT, not a schema migration, or the day
-- the domain changes is the day posting breaks and nobody knows why.
--
-- Rechecked 2026-09-22: all 77 media_urls in production are on the worker
-- host, and no row has an hls_url.
--
-- Seeded with the hosts that are actually in use. All 71 non-null media_urls
-- rows in production on 2026-09-18 point at the worker, so no existing row is
-- invalidated by this.

begin;

create table if not exists public.media_url_hosts (
  host       text primary key,
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.media_url_hosts is
  'Hosts that may appear in public_echoes.media_urls / hls_url. Add a row to allow a new media origin; nothing client-facing may write here.';

insert into public.media_url_hosts (host, note) values
  ('echo-mobile.at3236129.workers.dev', 'Cloudflare worker that fronts R2 and Supabase Storage; every media_urls row in production points here'),
  ('eyokhisijabitzjiydmz.supabase.co',  'Supabase Storage public objects, for the pre-worker URL shape that workerUrl.ts still rewrites')
on conflict (host) do nothing;

-- Not readable or writable by clients. It is referenced only from the
-- SECURITY DEFINER function below, so it cannot be enumerated or tampered with,
-- and cannot become an oracle for infrastructure names.
alter table public.media_url_hosts enable row level security;
revoke all on public.media_url_hosts from anon, authenticated;

create or replace function public.media_url_allowed(p_url text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  -- https only. This also rejects javascript:, data:, file: and plain http,
  -- and a credentials-in-URL form (user:pass@host) fails to match the
  -- allowlist because the captured authority still carries the userinfo.
  select p_url is null
      or exists (
        select 1 from public.media_url_hosts h
        where h.host = substring(p_url from '^https://([^/?#]+)')
      );
$fn$;

comment on function public.media_url_allowed(text) is
  'Whether a media URL points at an allowed Echo-controlled host. Null is allowed so the column stays optional.';

revoke all on function public.media_url_allowed(text) from public, anon, authenticated;

-- Security definer, because it calls media_url_allowed(), which clients may
-- not execute. As security invoker it ran as the posting user and every
-- insert and update on public_echoes failed with "permission denied for
-- function media_url_allowed", media or not. It reads only NEW, so running as
-- the owner grants the caller nothing.
create or replace function public.guard_media_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url text;
begin
  -- Rejected, not silently corrected. guard_client_writes corrects columns the
  -- server owns because an honest client never writes them; here the client is
  -- supposed to supply the value, so a bad one is a mistake the caller needs
  -- told about rather than a forged field to quietly drop.
  if new.media_urls is not null then
    foreach v_url in array new.media_urls loop
      if not public.media_url_allowed(v_url) then
        raise exception
          'media_urls must point at an allowed Echo media host (got %). Upload through the media worker, or add the host to public.media_url_hosts.', v_url
          using errcode = '42501';
      end if;
    end loop;
  end if;

  if not public.media_url_allowed(new.hls_url) then
    raise exception
      'hls_url must point at an allowed Echo media host (got %).', new.hls_url
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- Name orders it after a_guard_client_writes, which normalises server-owned
-- columns first; this then judges what the client legitimately supplied.
drop trigger if exists b_guard_media_provenance on public.public_echoes;
create trigger b_guard_media_provenance
  before insert or update on public.public_echoes
  for each row execute function public.guard_media_provenance();

commit;
