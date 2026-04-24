-- Phase 1 social-loop schema additions:
--   * Quote-repost (public_echoes.quoted_echo_id)
--   * Comment threading (echo_comments.parent_comment_id)
--   * Mutes / blocks tables (user_blocks already exists in some envs; guard)
--   * Pinned echoes (public_echoes.pinned_at)

-- ── Quote-repost ────────────────────────────────────────────
alter table public.public_echoes
  add column if not exists quoted_echo_id uuid
  references public.public_echoes (id) on delete set null;

create index if not exists idx_public_echoes_quoted_echo_id
  on public.public_echoes (quoted_echo_id)
  where quoted_echo_id is not null;

-- A quote-repost still bumps the original's repost_count so the action
-- bar number reflects the reach. The same trigger keeps undo working.
create or replace function public.bump_quote_repost_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' and new.quoted_echo_id is not null then
    update public.public_echoes
       set repost_count = repost_count + 1
     where id = new.quoted_echo_id;
  elsif TG_OP = 'DELETE' and old.quoted_echo_id is not null then
    update public.public_echoes
       set repost_count = greatest(repost_count - 1, 0)
     where id = old.quoted_echo_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_bump_quote_repost_count on public.public_echoes;
create trigger trg_bump_quote_repost_count
  after insert or delete on public.public_echoes
  for each row execute function public.bump_quote_repost_count();

-- ── Comment threading ───────────────────────────────────────
alter table public.echo_comments
  add column if not exists parent_comment_id uuid
  references public.echo_comments (id) on delete cascade;

create index if not exists idx_echo_comments_parent
  on public.echo_comments (parent_comment_id)
  where parent_comment_id is not null;

-- ── Mutes & blocks ──────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select using (auth.uid() = blocker_id);
drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own" on public.user_blocks
  for insert with check (auth.uid() = blocker_id);
drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own" on public.user_blocks
  for delete using (auth.uid() = blocker_id);

create table if not exists public.user_mutes (
  muter_id uuid not null references auth.users (id) on delete cascade,
  muted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);
alter table public.user_mutes enable row level security;
drop policy if exists "user_mutes_select_own" on public.user_mutes;
create policy "user_mutes_select_own" on public.user_mutes
  for select using (auth.uid() = muter_id);
drop policy if exists "user_mutes_insert_own" on public.user_mutes;
create policy "user_mutes_insert_own" on public.user_mutes
  for insert with check (auth.uid() = muter_id);
drop policy if exists "user_mutes_delete_own" on public.user_mutes;
create policy "user_mutes_delete_own" on public.user_mutes
  for delete using (auth.uid() = muter_id);

-- ── Pinned echoes ───────────────────────────────────────────
alter table public.public_echoes
  add column if not exists pinned_at timestamptz;

create index if not exists idx_public_echoes_pinned
  on public.public_echoes (author_id, pinned_at desc nulls last);
