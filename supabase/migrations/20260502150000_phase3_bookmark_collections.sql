-- Phase 3 — bookmark collections (folders)

create table if not exists public.bookmark_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.bookmark_collections enable row level security;
drop policy if exists "bm_coll_select_own" on public.bookmark_collections;
create policy "bm_coll_select_own" on public.bookmark_collections
  for select using (auth.uid() = owner_id);
drop policy if exists "bm_coll_insert_own" on public.bookmark_collections;
create policy "bm_coll_insert_own" on public.bookmark_collections
  for insert with check (auth.uid() = owner_id);
drop policy if exists "bm_coll_update_own" on public.bookmark_collections;
create policy "bm_coll_update_own" on public.bookmark_collections
  for update using (auth.uid() = owner_id);
drop policy if exists "bm_coll_delete_own" on public.bookmark_collections;
create policy "bm_coll_delete_own" on public.bookmark_collections
  for delete using (auth.uid() = owner_id);

alter table public.echo_bookmarks
  add column if not exists collection_id uuid references public.bookmark_collections (id) on delete set null;

create index if not exists idx_echo_bookmarks_collection
  on public.echo_bookmarks (user_id, collection_id);
