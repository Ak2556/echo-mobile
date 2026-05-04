-- Phase 2 — push notifications + notifications table

alter table public.profiles
  add column if not exists push_token text,
  add column if not exists language text default 'en';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('like','comment','follow','repost','mention','dm')),
  actor_id uuid not null references auth.users (id) on delete cascade,
  target_kind text,
  target_id uuid,
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id);

-- Aggregated view for the "Alice and 11 others liked your echo" UI.
-- security_invoker ensures the view respects RLS on the underlying notifications table.
create or replace view public.notification_groups
  with (security_invoker = true)
as
  select
    user_id,
    type,
    coalesce(target_id::text, actor_id::text) as bucket_target,
    date_trunc('hour', created_at) as bucket_hour,
    count(*) as actor_count,
    (array_agg(actor_id order by created_at desc))[1:3] as latest_actor_ids,
    max(created_at) as latest_created_at,
    max(preview) as preview,
    bool_or(read_at is null) as has_unread
  from public.notifications
  group by user_id, type, bucket_target, bucket_hour;
