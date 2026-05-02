-- Phase 3 — direct messages with media, voice, and link previews

create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
alter table public.dm_conversations enable row level security;
drop policy if exists "dm_conv_select_participants" on public.dm_conversations;
create policy "dm_conv_select_participants" on public.dm_conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "dm_conv_insert_participant" on public.dm_conversations;
create policy "dm_conv_insert_participant" on public.dm_conversations
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('text','image','voice','echo','link')),
  text text,
  media_url text,
  voice_url text,
  voice_duration_ms int,
  shared_echo_id uuid references public.public_echoes (id) on delete set null,
  link_preview jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_dm_conv_created on public.direct_messages (conversation_id, created_at);
create index if not exists idx_dm_text_trgm on public.direct_messages using gin (text gin_trgm_ops);
create extension if not exists pg_trgm;

alter table public.direct_messages enable row level security;
drop policy if exists "dm_select_participants" on public.direct_messages;
create policy "dm_select_participants" on public.direct_messages
  for select using (
    exists (select 1 from public.dm_conversations c
             where c.id = conversation_id
               and (auth.uid() = c.user_a or auth.uid() = c.user_b))
  );
drop policy if exists "dm_insert_self" on public.direct_messages;
create policy "dm_insert_self" on public.direct_messages
  for insert with check (auth.uid() = sender_id);
drop policy if exists "dm_update_participants" on public.direct_messages;
create policy "dm_update_participants" on public.direct_messages
  for update using (
    exists (select 1 from public.dm_conversations c
             where c.id = conversation_id
               and (auth.uid() = c.user_a or auth.uid() = c.user_b))
  );
