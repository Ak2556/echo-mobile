-- Base schema: profiles, public_echoes, echo_likes, echo_comments, follows
-- This must run before all other migrations.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── Profiles (mirrors auth.users) ─────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique,
  display_name  text not null default '',
  bio           text,
  avatar_color  text not null default '#3B82F6',
  avatar_url    text,
  is_verified   boolean not null default false,
  follower_count int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Follows ───────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_follower_idx  on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others"
  on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

-- Trigger to keep follower_count in sync
create or replace function public.adjust_follower_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set follower_count = greatest(0, follower_count - 1) where id = old.following_id;
  end if;
  return null;
end;
$$;

drop trigger if exists on_follow_change on public.follows;
create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute function public.adjust_follower_count();

-- ── Public Echoes ─────────────────────────────────────────────────────────────
create table if not exists public.public_echoes (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles (id) on delete cascade,
  title         text,
  prompt        text not null default '',
  response      text not null default '',
  likes_count   int not null default 0,
  comment_count int not null default 0,
  repost_count  int not null default 0,
  view_count    int not null default 0,
  media_urls    text[],
  quoted_echo_id uuid references public.public_echoes (id) on delete set null,
  pinned_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_public_echoes_author    on public.public_echoes (author_id, created_at desc);
create index if not exists idx_public_echoes_created   on public.public_echoes (created_at desc);
create index if not exists idx_public_echoes_likes     on public.public_echoes (likes_count desc);

alter table public.public_echoes enable row level security;

drop policy if exists "Echoes are viewable by everyone" on public.public_echoes;
create policy "Echoes are viewable by everyone"
  on public.public_echoes for select using (true);

drop policy if exists "Users can insert own echoes" on public.public_echoes;
create policy "Users can insert own echoes"
  on public.public_echoes for insert with check (auth.uid() = author_id);

drop policy if exists "Users can update own echoes" on public.public_echoes;
create policy "Users can update own echoes"
  on public.public_echoes for update using (auth.uid() = author_id);

drop policy if exists "Users can delete own echoes" on public.public_echoes;
create policy "Users can delete own echoes"
  on public.public_echoes for delete using (auth.uid() = author_id);

-- ── Echo Likes ─────────────────────────────────────────────────────────────────
create table if not exists public.echo_likes (
  id         uuid primary key default gen_random_uuid(),
  echo_id    uuid not null references public.public_echoes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (echo_id, user_id)
);

create index if not exists echo_likes_echo_idx on public.echo_likes (echo_id);
create index if not exists echo_likes_user_idx on public.echo_likes (user_id);

create or replace function public.adjust_echo_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set likes_count = likes_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set likes_count = greatest(0, likes_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_echo_like_change on public.echo_likes;
create trigger on_echo_like_change
  after insert or delete on public.echo_likes
  for each row execute procedure public.adjust_echo_likes_count();

alter table public.echo_likes enable row level security;

drop policy if exists "Likes are viewable by everyone" on public.echo_likes;
create policy "Likes are viewable by everyone"
  on public.echo_likes for select using (true);

drop policy if exists "Users can like echoes" on public.echo_likes;
create policy "Users can like echoes"
  on public.echo_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can unlike echoes" on public.echo_likes;
create policy "Users can unlike echoes"
  on public.echo_likes for delete using (auth.uid() = user_id);

-- ── Echo Comments ──────────────────────────────────────────────────────────────
create table if not exists public.echo_comments (
  id                uuid primary key default gen_random_uuid(),
  echo_id           uuid not null references public.public_echoes (id) on delete cascade,
  author_id         uuid not null references public.profiles (id) on delete cascade,
  content           text not null,
  parent_comment_id uuid references public.echo_comments (id) on delete cascade,
  likes_count       int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists echo_comments_echo_idx   on public.echo_comments (echo_id, created_at desc);
create index if not exists echo_comments_author_idx on public.echo_comments (author_id);
create index if not exists echo_comments_parent_idx on public.echo_comments (parent_comment_id)
  where parent_comment_id is not null;

create or replace function public.adjust_echo_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set comment_count = comment_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set comment_count = greatest(0, comment_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_echo_comment_change on public.echo_comments;
create trigger on_echo_comment_change
  after insert or delete on public.echo_comments
  for each row execute procedure public.adjust_echo_comment_count();

alter table public.echo_comments enable row level security;

drop policy if exists "Comments are viewable by everyone" on public.echo_comments;
create policy "Comments are viewable by everyone"
  on public.echo_comments for select using (true);

drop policy if exists "Users can insert own comments" on public.echo_comments;
create policy "Users can insert own comments"
  on public.echo_comments for insert with check (auth.uid() = author_id);

drop policy if exists "Users can delete own comments" on public.echo_comments;
create policy "Users can delete own comments"
  on public.echo_comments for delete using (auth.uid() = author_id);

-- ── Bookmarks ──────────────────────────────────────────────────────────────────
create table if not exists public.echo_bookmarks (
  id         uuid primary key default gen_random_uuid(),
  echo_id    uuid not null references public.public_echoes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (echo_id, user_id)
);

create index if not exists echo_bookmarks_user_idx on public.echo_bookmarks (user_id, created_at desc);
create index if not exists echo_bookmarks_echo_idx on public.echo_bookmarks (echo_id);

alter table public.echo_bookmarks enable row level security;

drop policy if exists "Users can view own bookmarks" on public.echo_bookmarks;
create policy "Users can view own bookmarks"
  on public.echo_bookmarks for select using (auth.uid() = user_id);

drop policy if exists "Users can bookmark echoes" on public.echo_bookmarks;
create policy "Users can bookmark echoes"
  on public.echo_bookmarks for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove bookmarks" on public.echo_bookmarks;
create policy "Users can remove bookmarks"
  on public.echo_bookmarks for delete using (auth.uid() = user_id);

