-- Structured, queryable Tasks data — mirrors the local-first task list so the
-- server can surface what's open / due / high-priority for insights, AI, and
-- reminders. Owner-scoped RLS; blob (mini_app_data) stays authoritative.

create table if not exists public.task_item (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  title      text not null,
  notes      text,
  due        date,
  done       boolean not null default false,
  priority   text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz,
  updated_at timestamptz,
  unique (user_id, client_id)
);

create index if not exists task_item_user_open_idx on public.task_item (user_id, done, due);

alter table public.task_item enable row level security;
create policy "own tasks — select" on public.task_item for select using (auth.uid() = user_id);
create policy "own tasks — insert" on public.task_item for insert with check (auth.uid() = user_id);
create policy "own tasks — update" on public.task_item for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks — delete" on public.task_item for delete using (auth.uid() = user_id);

-- Open-task summary shared by the app / AI / reminders.
create or replace function public.task_stats(p_user uuid default auth.uid())
returns table (
  open_count   int,
  done_count   int,
  due_today    int,
  overdue      int,
  high_open    int
)
language sql stable security invoker as $$
  select
    count(*) filter (where not done)::int,
    count(*) filter (where done)::int,
    count(*) filter (where not done and due = current_date)::int,
    count(*) filter (where not done and due < current_date)::int,
    count(*) filter (where not done and priority = 'high')::int
  from public.task_item
  where user_id = p_user;
$$;
