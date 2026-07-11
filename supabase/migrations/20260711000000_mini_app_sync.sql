-- Cross-device sync for the local mini-app tools (notes, habits, expenses).
-- One JSONB document per (user, app): these are single-user personal
-- collections, so whole-document last-write-wins is the honest sync model —
-- no merge conflicts to resolve, and the newest device wins.

create table if not exists public.mini_app_data (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  app        text not null check (app in ('notes', 'habits', 'expenses')),
  data       jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);

alter table public.mini_app_data enable row level security;

create policy "own mini app data — select"
  on public.mini_app_data for select using (auth.uid() = user_id);
create policy "own mini app data — insert"
  on public.mini_app_data for insert with check (auth.uid() = user_id);
create policy "own mini app data — update"
  on public.mini_app_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mini app data — delete"
  on public.mini_app_data for delete using (auth.uid() = user_id);
