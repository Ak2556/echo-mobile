-- Moderation for marketplace listing photos and profile avatars.
--
-- Echoes had a gate (check_content, set only by the judge); listings and
-- avatars had none, so any photo a seller or user uploaded was public the
-- moment it was saved. App Store guideline 1.2 asks a UGC app to filter
-- objectionable content, and a marketplace is the place it is most often abused.
--
-- LISTINGS follow the echo model. A new or edited listing is hidden from
-- everyone but its seller until the judge passes it:
--   * check_content / moderated_at / content_version are owned by a trigger, so
--     a client cannot publish itself (the seller-update policy would otherwise
--     let them set check_content = true).
--   * An edit to title, description, tags or photos is new content: it is
--     hidden again and re-queued, and a verdict applies only to the
--     content_version it judged (as in 20260928100000).
--   * The public read policy now requires check_content.
--
-- AVATARS are not gated on read: profiles.avatar_url is joined by the feed,
-- comments, search and DMs, and a flag on every one of those would be a
-- rewrite. A changed avatar is queued instead, and one that fails is cleared,
-- which falls back to the coloured initial. There is a short window between
-- upload and verdict in which the new picture is visible. Avatars set before
-- this migration are not re-judged (that would be a burst of model calls); they
-- are judged the next time they change.
--
-- Both go through a new 'media_moderation' queue drained by the worker.

begin;

select pgmq.create('media_moderation');

-- ── listings: columns ───────────────────────────────────────────────────────
alter table public.marketplace_listings
  add column if not exists check_content boolean not null default false,
  add column if not exists moderated_at timestamptz,
  add column if not exists content_version integer not null default 1;

comment on column public.marketplace_listings.check_content is
  'True once the judge has passed this version of the listing. Only the service role can set it.';
comment on column public.marketplace_listings.content_version is
  'Bumped by trigger on every change to title, description, tags or photo_urls. A verdict is written only where this still equals the version that was judged.';

-- Listings already live were never moderated, but hiding all of them until the
-- queue drains would empty the marketplace on deploy. They stay visible and are
-- queued below; one that fails flips to hidden.
update public.marketplace_listings
   set check_content = true
 where check_content = false
   and moderated_at is null;

-- ── listings: the trigger that owns the moderation columns ──────────────────
-- Named "a_" so it runs before the enqueue trigger. Only client roles are
-- constrained: the worker writes its verdict as the service role.
create or replace function public.guard_listing_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.check_content := false;
      new.moderated_at  := null;
    end if;
    new.content_version := 1;
    return new;
  end if;

  if (new.title, new.description, new.photo_urls, new.tags)
     is distinct from (old.title, old.description, old.photo_urls, old.tags) then
    -- New content has no verdict, whoever wrote it.
    new.content_version := old.content_version + 1;
    new.check_content   := false;
    new.moderated_at    := null;
  else
    new.content_version := old.content_version;
    if current_user in ('anon', 'authenticated') then
      new.check_content := old.check_content;
      new.moderated_at  := old.moderated_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_listing_moderation() from public, anon, authenticated;

drop trigger if exists a_guard_listing_moderation on public.marketplace_listings;
create trigger a_guard_listing_moderation
  before insert or update on public.marketplace_listings
  for each row execute function public.guard_listing_moderation();

-- ── listings: enqueue ───────────────────────────────────────────────────────
create or replace function public.moderate_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.check_content is true or new.status = 'removed' then
    return new;
  end if;
  perform public.jobs_enqueue('media_moderation', jsonb_build_object(
    'kind', 'listing', 'id', new.id, 'content_version', new.content_version));
  return new;
end;
$$;

revoke all on function public.moderate_listing() from public, anon, authenticated;

drop trigger if exists trg_moderate_listing on public.marketplace_listings;
create trigger trg_moderate_listing
  after insert or update of title, description, photo_urls, tags on public.marketplace_listings
  for each row execute function public.moderate_listing();

-- ── listings: read path ─────────────────────────────────────────────────────
-- The seller policy ("sellers read own") is unchanged, so a seller still sees
-- their own listing while it waits.
drop policy if exists "read active listings" on public.marketplace_listings;
create policy "read active listings"
  on public.marketplace_listings for select
  using (status = 'active' and check_content);

-- Judge every listing that is live now, so the grandfathered ones are
-- not left unmoderated. One kick for the batch; the worker drains it.
select pgmq.send('media_moderation', jsonb_build_object(
         'kind', 'listing', 'id', id, 'content_version', content_version))
  from public.marketplace_listings
 where status <> 'removed';

-- ── avatars ─────────────────────────────────────────────────────────────────
create or replace function public.moderate_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_url is null or new.avatar_url = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  perform public.jobs_enqueue('media_moderation', jsonb_build_object(
    'kind', 'avatar', 'id', new.id, 'url', new.avatar_url));
  return new;
end;
$$;

revoke all on function public.moderate_avatar() from public, anon, authenticated;

drop trigger if exists trg_moderate_avatar on public.profiles;
create trigger trg_moderate_avatar
  after insert or update of avatar_url on public.profiles
  for each row execute function public.moderate_avatar();

commit;

select public.jobs_kick('media_moderation');
