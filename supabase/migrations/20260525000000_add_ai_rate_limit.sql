-- Per-user AI rate limit + moderation gate.
--
-- The Edge Function `echo-ai` upserts one row per user with the current
-- hourly window's start + request count. RLS lets each user see (but
-- never modify) their own row. Writes happen through the function which
-- runs against the authenticated user's JWT — so RLS still applies and
-- a misbehaving client can't tamper with someone else's limit.
--
-- The `public_echoes.check_content` column is the secondary moderation
-- gate (Task 4). The Edge Function flips it to true only after the
-- moderation API verdict is "safe". Default false ensures any direct
-- insert (e.g. via a buggy admin tool) is invisible to the public feed
-- until reviewed.

-- ai_rate_limits
create table if not exists public.ai_rate_limits (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  window_start   timestamptz not null default now(),
  request_count  integer     not null default 1,
  updated_at     timestamptz not null default now()
);

create index if not exists idx_ai_rate_limits_window_start
  on public.ai_rate_limits (window_start desc);

alter table public.ai_rate_limits enable row level security;

drop policy if exists "Users can read their own AI limit" on public.ai_rate_limits;
create policy "Users can read their own AI limit"
  on public.ai_rate_limits for select
  using (auth.uid() = user_id);

-- Writes happen from the Edge Function using the per-user JWT. Each user
-- can insert/update their own row. They cannot delete it (drift would
-- effectively reset the limit).
drop policy if exists "Users can insert their own AI limit" on public.ai_rate_limits;
create policy "Users can insert their own AI limit"
  on public.ai_rate_limits for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own AI limit" on public.ai_rate_limits;
create policy "Users can update their own AI limit"
  on public.ai_rate_limits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Moderation gate on public_echoes
alter table public.public_echoes
  add column if not exists check_content boolean not null default false;

-- Backfill rows that pre-date the moderation gate so the feed doesn't go
-- empty for existing users.
update public.public_echoes
   set check_content = true
 where check_content = false
   and created_at < (now() - interval '0 seconds');

-- Optional index — used by the public feed query to skip unverified rows
-- quickly. Composite with created_at because that's the existing sort key.
create index if not exists idx_public_echoes_check_content
  on public.public_echoes (check_content, created_at desc);
