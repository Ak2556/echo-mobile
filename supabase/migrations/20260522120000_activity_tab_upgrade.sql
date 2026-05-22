-- Activity tab upgrade: new notification kinds for reactions, bookmarks, and quotes.
--
-- Adds three notification types and the triggers that produce them. The notifications
-- table previously had a strict CHECK constraint on `type`; this migration drops and
-- recreates that constraint with the expanded value set, then adds best-effort triggers
-- that never fail the parent write if notification insertion errors.

-- 1) Expand the type CHECK constraint.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('like','comment','follow','repost','mention','dm','reaction','bookmark','quote'));

-- 2) Reaction notifications — fired when someone reacts to your echo.
create or replace function public.notify_on_echo_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.public_echoes where id = new.echo_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (v_author, 'reaction', new.user_id, 'echo', new.echo_id, new.reaction);
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_notify_echo_reaction on public.echo_reactions;
create trigger trg_notify_echo_reaction
  after insert on public.echo_reactions
  for each row execute function public.notify_on_echo_reaction();

-- 3) Bookmark notifications — "X saved your echo".
create or replace function public.notify_on_echo_bookmark()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.public_echoes where id = new.echo_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
  values (v_author, 'bookmark', new.user_id, 'echo', new.echo_id);
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_notify_echo_bookmark on public.echo_bookmarks;
create trigger trg_notify_echo_bookmark
  after insert on public.echo_bookmarks
  for each row execute function public.notify_on_echo_bookmark();

-- 4) Quote notifications — fired when someone publishes an echo that quotes yours.
create or replace function public.notify_on_echo_quote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  if new.quoted_echo_id is null then return new; end if;
  select author_id into v_author from public.public_echoes where id = new.quoted_echo_id;
  if v_author is null or v_author = new.author_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (v_author, 'quote', new.author_id, 'echo', new.id, left(new.prompt, 140));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_notify_echo_quote on public.public_echoes;
create trigger trg_notify_echo_quote
  after insert on public.public_echoes
  for each row execute function public.notify_on_echo_quote();
