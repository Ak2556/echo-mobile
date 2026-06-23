-- Align profiles/public_echoes with app + ERD; rename embedding table; repost + deduped views.

-- Columns (idempotent)
alter table public.profiles add column if not exists avatar_url text;

alter table public.public_echoes add column if not exists media_urls text[];

-- Rename legacy embeddings table (avoids clash with UX “messages”)
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'messages' and c.relkind = 'r'
  ) then
    alter table public.messages rename to rag_embedding_messages;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'messages_embedding_idx'
  ) then
    alter index public.messages_embedding_idx rename to rag_embedding_messages_embedding_idx;
  end if;
end $$;

-- Reposts (mirrors echo_likes counter pattern)
create table if not exists public.echo_reposts (
  id uuid primary key default gen_random_uuid(),
  echo_id uuid not null references public.public_echoes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (echo_id, user_id)
);

create index if not exists echo_reposts_echo_idx on public.echo_reposts (echo_id);
create index if not exists echo_reposts_user_idx on public.echo_reposts (user_id);

create or replace function public.adjust_echo_repost_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set repost_count = repost_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set repost_count = greatest(0, repost_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_echo_repost_change on public.echo_reposts;
create trigger on_echo_repost_change
  after insert or delete on public.echo_reposts
  for each row execute procedure public.adjust_echo_repost_count();

alter table public.echo_reposts enable row level security;

drop policy if exists "Reposts are viewable" on public.echo_reposts;
create policy "Reposts are viewable"
  on public.echo_reposts for select using (true);

drop policy if exists "Users insert own reposts" on public.echo_reposts;
create policy "Users insert own reposts"
  on public.echo_reposts for insert with check (auth.uid() = user_id);

drop policy if exists "Users delete own reposts" on public.echo_reposts;
create policy "Users delete own reposts"
  on public.echo_reposts for delete using (auth.uid() = user_id);

drop policy if exists "Anon can read reposts" on public.echo_reposts;
create policy "Anon can read reposts"
  on public.echo_reposts for select to anon using (true);

-- Views: one row per user per echo -> increments view_count once
create table if not exists public.echo_views (
  echo_id uuid not null references public.public_echoes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (echo_id, user_id)
);

create index if not exists echo_views_user_idx on public.echo_views (user_id);

create or replace function public.adjust_echo_view_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set view_count = view_count + 1 where id = new.echo_id;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists on_echo_view_insert on public.echo_views;
create trigger on_echo_view_insert
  after insert on public.echo_views
  for each row execute procedure public.adjust_echo_view_count();

alter table public.echo_views enable row level security;

drop policy if exists "Users insert own echo views" on public.echo_views;
create policy "Users insert own echo views"
  on public.echo_views for insert with check (auth.uid() = user_id);

drop policy if exists "Users view own echo_views rows" on public.echo_views;
create policy "Users view own echo_views rows"
  on public.echo_views for select using (auth.uid() = user_id);
