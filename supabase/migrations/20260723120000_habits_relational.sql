-- Structured, queryable Habits data — the substrate for server-side streaks,
-- comparison with people you follow, AI coaching, and milestone notifications.
--
-- The local-first blob in mini_app_data stays authoritative for the offline UI;
-- these tables are upserted best-effort on save (see lib/habitsRemote.ts) so the
-- server always has structured rows it can query and reason about. Everything is
-- owner-scoped via RLS; social/comparison reads come in a later phase.

create table if not exists public.habit (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  client_id      text not null,
  name           text not null,
  marker         text,
  color          text,
  weekly_goal    int,
  scheduled_days int[],
  daily_target   int,
  reminder       jsonb,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.habit_entry (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  habit_client_id text not null,
  date            date not null,
  count           int not null default 1,
  note            text,
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, habit_client_id, date),
  foreign key (user_id, habit_client_id)
    references public.habit (user_id, client_id) on delete cascade
);

create index if not exists habit_user_idx on public.habit (user_id);
create index if not exists habit_entry_user_date_idx on public.habit_entry (user_id, date desc);
create index if not exists habit_entry_habit_idx on public.habit_entry (user_id, habit_client_id, date desc);

alter table public.habit enable row level security;
alter table public.habit_entry enable row level security;

create policy "own habits — select" on public.habit for select using (auth.uid() = user_id);
create policy "own habits — insert" on public.habit for insert with check (auth.uid() = user_id);
create policy "own habits — update" on public.habit for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own habits — delete" on public.habit for delete using (auth.uid() = user_id);

create policy "own habit entries — select" on public.habit_entry for select using (auth.uid() = user_id);
create policy "own habit entries — insert" on public.habit_entry for insert with check (auth.uid() = user_id);
create policy "own habit entries — update" on public.habit_entry for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own habit entries — delete" on public.habit_entry for delete using (auth.uid() = user_id);

-- Keep habit.updated_at fresh on edits.
create or replace function public.touch_habit_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists habit_touch_updated_at on public.habit;
create trigger habit_touch_updated_at before update on public.habit
  for each row execute function public.touch_habit_updated_at();

-- Server-computed per-habit stats (current + best consecutive-day streak over the
-- last ~2 years, plus 30-day completion rate) so the app, AI, and comparison
-- features share one source of truth instead of each recomputing client-side.
create or replace function public.habit_stats(p_user uuid default auth.uid())
returns table (
  habit_client_id text,
  entries         int,
  last_date       date,
  current_streak  int,
  completion_30d  int
)
language sql stable security invoker as $$
  with days as (
    select e.habit_client_id, e.date
    from public.habit_entry e
    where e.user_id = p_user
  ),
  streaks as (
    select
      habit_client_id,
      date,
      date - (row_number() over (partition by habit_client_id order by date))::int as grp
    from days
  ),
  runs as (
    select habit_client_id, grp, count(*) as len, max(date) as run_end
    from streaks
    group by habit_client_id, grp
  )
  select
    d.habit_client_id,
    count(*)::int as entries,
    max(d.date) as last_date,
    coalesce((
      select r.len::int from runs r
      where r.habit_client_id = d.habit_client_id
        and r.run_end >= current_date - 1
      order by r.run_end desc limit 1
    ), 0) as current_streak,
    count(*) filter (where d.date > current_date - 30)::int as completion_30d
  from days d
  group by d.habit_client_id;
$$;
