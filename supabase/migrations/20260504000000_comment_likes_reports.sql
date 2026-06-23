-- P1-6: comment_likes — persisted comment likes with counter trigger
-- P2-3: reports — user-submitted content reports

-- comment_likes
create table if not exists public.comment_likes (
  comment_id uuid not null references public.echo_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);
create index if not exists comment_likes_user_idx    on public.comment_likes (user_id);

-- Counter trigger: keep echo_comments.likes_count in sync
create or replace function public.adjust_comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.echo_comments
       set likes_count = coalesce(likes_count, 0) + 1
     where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.echo_comments
       set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
     where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_comment_like_change on public.comment_likes;
create trigger on_comment_like_change
  after insert or delete on public.comment_likes
  for each row execute procedure public.adjust_comment_likes_count();

-- Add likes_count column to echo_comments if missing
alter table public.echo_comments
  add column if not exists likes_count integer not null default 0;

alter table public.comment_likes enable row level security;

drop policy if exists "Comment likes viewable by all" on public.comment_likes;
create policy "Comment likes viewable by all"
  on public.comment_likes for select using (true);

drop policy if exists "Users insert own comment likes" on public.comment_likes;
create policy "Users insert own comment likes"
  on public.comment_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users delete own comment likes" on public.comment_likes;
create policy "Users delete own comment likes"
  on public.comment_likes for delete using (auth.uid() = user_id);

-- reports
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('echo', 'user', 'comment')),
  target_id   uuid not null,
  reason      text not null,
  details     text,
  status      text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  action_taken text,
  internal_notes text,
  created_at  timestamptz not null default now()
);

create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_target_idx   on public.reports (target_id);
create index if not exists reports_status_created_idx on public.reports (status, created_at);

alter table public.reports enable row level security;

drop policy if exists "Users insert own reports" on public.reports;
create policy "Users insert own reports"
  on public.reports for insert with check (auth.uid() = reporter_id);

-- reporters can read their own submissions
drop policy if exists "Users read own reports" on public.reports;
create policy "Users read own reports"
  on public.reports for select using (auth.uid() = reporter_id);

-- notifications triggers
-- Insert a notification row whenever someone likes an echo, comments, or follows.
-- The push-fanout Edge Function is invoked separately via pg_net / webhooks.

create or replace function public.notify_on_echo_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id
    from public.public_echoes where id = new.echo_id;

  -- Don't notify self-likes
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (v_author_id, 'like', new.user_id, 'echo', new.echo_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_echo_liked_notify on public.echo_likes;
create trigger on_echo_liked_notify
  after insert on public.echo_likes
  for each row execute procedure public.notify_on_echo_like();


create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id
    from public.public_echoes where id = new.echo_id;

  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    values (v_author_id, 'comment', new.user_id, 'echo', new.echo_id,
            left(new.content, 120))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_comment_notify on public.echo_comments;
create trigger on_comment_notify
  after insert on public.echo_comments
  for each row execute procedure public.notify_on_comment();


create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_follow_notify on public.follows;
create trigger on_follow_notify
  after insert on public.follows
  for each row execute procedure public.notify_on_follow();
