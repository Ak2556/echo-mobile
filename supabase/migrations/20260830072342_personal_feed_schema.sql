-- Per-user state for the personalized For You ranker.
-- user_taste caches the taste vector so the HNSW index is usable: an ANN search
-- needs a constant vector, which a per-request avg(embedding) CTE is not.

create table if not exists public.user_taste (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  taste_vector extensions.vector(768),
  top_authors  uuid[] not null default '{}',
  updated_at   timestamptz not null default now()
);

alter table public.user_taste enable row level security;

drop policy if exists "user_taste read own" on public.user_taste;
create policy "user_taste read own"
  on public.user_taste for select
  using (auth.uid() = user_id);

-- Negative signal. Exactly one target per row: an echo, or a whole author.
create table if not exists public.user_not_interested (
  user_id    uuid not null references auth.users (id) on delete cascade,
  echo_id    uuid references public.public_echoes (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_not_interested_target_chk check (num_nonnulls(echo_id, author_id) = 1)
);

create unique index if not exists user_not_interested_echo_uidx
  on public.user_not_interested (user_id, echo_id) where echo_id is not null;
create unique index if not exists user_not_interested_author_uidx
  on public.user_not_interested (user_id, author_id) where author_id is not null;

alter table public.user_not_interested enable row level security;

drop policy if exists "user_not_interested rw own" on public.user_not_interested;
create policy "user_not_interested rw own"
  on public.user_not_interested for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seen-state anti-join support. echo_views has (user_id) and (echo_id, user_id)
-- but nothing that makes "this user's views in the last 90 days" cheap.
create index if not exists echo_views_user_created_idx
  on public.echo_views (user_id, created_at desc);
