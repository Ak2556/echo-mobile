-- Private accounts that are actually private, plus the abuse limits found in the
-- 2026-10-08 backend audit.
--
-- THE HOLE. Settings has a "Private account" switch, but anyone could tap Follow
-- on a private account and be accepted instantly (the follows INSERT policy only
-- checked follower_id = auth.uid()), and followers may read a private author's
-- echoes. The switch hid nothing from a determined stranger. Comments and likes
-- were worse: two `USING (true)` SELECT policies on each table let anyone,
-- signed out included, read who commented on and liked a private author's posts.
-- The correct policy ("exists in public_echoes", which RLS gates) was already
-- there and was being OR-ed away.
--
-- THE FIX. Following a private account becomes a request the owner approves.
-- Writes go through SECURITY DEFINER functions that derive the caller from
-- auth.uid(); the table has no client write policy at all.

-- 1. Requests --------------------------------------------------------------
create table if not exists public.follow_requests (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id    uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_requests_not_self check (requester_id <> target_id)
);

create index if not exists follow_requests_target_idx
  on public.follow_requests (target_id, created_at desc);

alter table public.follow_requests enable row level security;

-- Read-only to clients. Without the revoke, Supabase's default grants would hand
-- anon and authenticated INSERT/UPDATE/DELETE and leave only RLS between them.
revoke all on public.follow_requests from public, anon, authenticated;
grant select on public.follow_requests to authenticated;

drop policy if exists follow_requests_select_own on public.follow_requests;
create policy follow_requests_select_own on public.follow_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

drop trigger if exists rate_limit_follow_requests_hour on public.follow_requests;
create trigger rate_limit_follow_requests_hour
  before insert on public.follow_requests
  for each row execute function public.enforce_insert_rate_limit('follow_request_hour', '60', '3600', 'requester_id');

-- 2. A direct follow of a private account is refused ------------------------
drop policy if exists "Users insert own follows" on public.follows;
create policy "Users insert own follows" on public.follows
  for insert
  with check (
    (select auth.uid()) = follower_id
    and not exists (
      select 1 from public.profiles p where p.id = following_id and p.is_private
    )
  );

-- An approval inserts the follow on the REQUESTER's behalf while the owner is the
-- signed-in user, and the follow limits (check_app_rate_limit) refuse a row whose
-- user is not the caller. The requester was already limited when they asked
-- (follow_request_hour above), so approvals skip these two.
drop trigger if exists rate_limit_follows_hour on public.follows;
create trigger rate_limit_follows_hour
  before insert on public.follows
  for each row
  when (current_setting('echo.approving_follow', true) is distinct from '1')
  execute function public.enforce_insert_rate_limit('follow_hour', '60', '3600', 'follower_id');

drop trigger if exists rate_limit_follows_day on public.follows;
create trigger rate_limit_follows_day
  before insert on public.follows
  for each row
  when (current_setting('echo.approving_follow', true) is distinct from '1')
  execute function public.enforce_insert_rate_limit('follow_day', '200', '86400', 'follower_id');

-- 3. Two new notification kinds ---------------------------------------------
-- Keep in step with NOTIFICATION_TYPES in lib/notifications/presentation.ts.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'like', 'comment', 'follow', 'repost', 'mention', 'dm', 'reaction',
  'bookmark', 'quote', 'report_resolved', 'content_removed',
  'appeal_resolved', 'daily_react', 'personal_nudge', 'friend_post',
  'social_task_update', 'friend_answer', 'report_urgent', 'rules_reminder',
  'follow_request', 'follow_accepted'
]::text[]));

-- An approved request already produced "accepted" for the requester and a
-- request row for the owner; a third "started following you" would be noise.
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('echo.approving_follow', true) = '1' then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id)
  on conflict do nothing;
  return new;
end;
$$;

-- 4. The operations ----------------------------------------------------------
-- Internal: turn a request into a follow. Not callable by clients; the callers
-- below have already established who is allowed to approve.
create or replace function public.approve_follow(p_requester uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('echo.approving_follow', '1', true);
  insert into public.follows (follower_id, following_id)
  values (p_requester, p_target)
  on conflict do nothing;
  perform set_config('echo.approving_follow', '', true);

  insert into public.notifications (user_id, type, actor_id)
  values (p_requester, 'follow_accepted', p_target)
  on conflict do nothing;
end;
$$;

revoke all on function public.approve_follow(uuid, uuid) from public, anon, authenticated;

-- Follow someone. Returns 'following' or 'requested'. A public account is
-- followed at once; a private one gets a request. A target who has blocked the
-- caller also answers 'requested', so a block is not revealed by the reply.
create or replace function public.request_follow(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_private boolean;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_target is null or p_target = v_uid then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  select p.is_private into v_private from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no_such_user' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_target) then
    return 'following';
  end if;

  if not coalesce(v_private, false) then
    insert into public.follows (follower_id, following_id) values (v_uid, p_target)
    on conflict do nothing;
    return 'following';
  end if;

  if exists (select 1 from public.user_blocks b where b.blocker_id = p_target and b.blocked_id = v_uid) then
    return 'requested';
  end if;

  insert into public.follow_requests (requester_id, target_id) values (v_uid, p_target)
  on conflict do nothing;
  if found then
    insert into public.notifications (user_id, type, actor_id)
    values (p_target, 'follow_request', v_uid)
    on conflict do nothing;
  end if;
  return 'requested';
end;
$$;

-- Withdraw your own request.
create or replace function public.cancel_follow_request(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  delete from public.follow_requests where requester_id = v_uid and target_id = p_target;
  delete from public.notifications
   where user_id = p_target and type = 'follow_request' and actor_id = v_uid;
end;
$$;

-- Approve or decline a request made to you. Returns false when there was none.
create or replace function public.respond_follow_request(p_requester uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  delete from public.follow_requests where requester_id = p_requester and target_id = v_uid;
  if not found then
    return false;
  end if;
  delete from public.notifications
   where user_id = v_uid and type = 'follow_request' and actor_id = p_requester;

  if p_accept then
    perform public.approve_follow(p_requester, v_uid);
  end if;
  return true;
end;
$$;

revoke all on function public.request_follow(uuid) from public, anon;
revoke all on function public.cancel_follow_request(uuid) from public, anon;
revoke all on function public.respond_follow_request(uuid, boolean) from public, anon;
grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.cancel_follow_request(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;

-- Going public releases everyone who was waiting. One requester hitting their
-- own follow limit must not stop the account from changing its setting.
create or replace function public.release_follow_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select requester_id from public.follow_requests where target_id = new.id loop
    begin
      perform public.approve_follow(r.requester_id, new.id);
    exception when others then
      continue;
    end;
  end loop;
  delete from public.follow_requests where target_id = new.id;
  delete from public.notifications where user_id = new.id and type = 'follow_request';
  return new;
end;
$$;

revoke all on function public.release_follow_requests() from public, anon, authenticated;

drop trigger if exists release_follow_requests on public.profiles;
create trigger release_follow_requests
  after update of is_private on public.profiles
  for each row
  when (old.is_private is true and new.is_private is not true)
  execute function public.release_follow_requests();

-- 5. Comments and likes follow the post's visibility -------------------------
-- The remaining policies ("... viewable by authorized users") test that the echo
-- is visible to the caller, and public_echoes is itself RLS-gated.
drop policy if exists "Anon can read comments" on public.echo_comments;
drop policy if exists "Comments are viewable" on public.echo_comments;
drop policy if exists "Anon can read likes" on public.echo_likes;
drop policy if exists "Likes are viewable" on public.echo_likes;

-- 6. Device keys: a cap, so reinstalls cannot pile up without limit ----------
-- Every message to a user is sealed to each of their live devices, and a key
-- lost with an uninstall is never revoked by anyone. Keep the ten most recently
-- seen and retire the rest; a retired device simply registers a new key if it
-- is still in use.
create or replace function public.cap_user_devices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_devices
     set revoked_at = now()
   where id in (
     select id from public.user_devices
      where user_id = new.user_id and revoked_at is null
      order by coalesce(last_seen_at, created_at) desc
      offset 9
   );
  return new;
end;
$$;

revoke all on function public.cap_user_devices() from public, anon, authenticated;

drop trigger if exists a_cap_user_devices on public.user_devices;
create trigger a_cap_user_devices
  before insert on public.user_devices
  for each row execute function public.cap_user_devices();

-- 7. Insert limits on the tables an account can fill without bound -----------
-- Limits sit far above any real use and exist only to stop a script.
drop trigger if exists rate_limit_marketplace_listings_hour on public.marketplace_listings;
create trigger rate_limit_marketplace_listings_hour
  before insert on public.marketplace_listings
  for each row execute function public.enforce_insert_rate_limit('marketplace_listing_hour', '20', '3600', 'seller_id');

drop trigger if exists rate_limit_push_tokens_hour on public.push_tokens;
create trigger rate_limit_push_tokens_hour
  before insert on public.push_tokens
  for each row execute function public.enforce_insert_rate_limit('push_token_hour', '60', '3600', 'user_id');

drop trigger if exists rate_limit_user_blocks_hour on public.user_blocks;
create trigger rate_limit_user_blocks_hour
  before insert on public.user_blocks
  for each row execute function public.enforce_insert_rate_limit('block_hour', '100', '3600', 'blocker_id');

drop trigger if exists rate_limit_ai_messages_hour on public.ai_messages;
create trigger rate_limit_ai_messages_hour
  before insert on public.ai_messages
  for each row execute function public.enforce_insert_rate_limit('ai_message_hour', '1000', '3600', 'user_id');
