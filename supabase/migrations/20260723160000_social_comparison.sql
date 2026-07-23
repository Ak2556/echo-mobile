-- Phase 3 — privacy-first social comparison for the structured mini-apps.
--
-- Nobody's data is exposed by default. A user must opt in (mini_app_share), and
-- even then only people who *follow* them can see AGGREGATE numbers (best
-- streak, this-week workouts, active days) via SECURITY DEFINER leaderboard
-- functions — never raw entries, notes, or amounts. The functions resolve the
-- caller with auth.uid() (JWT claim survives SECURITY DEFINER) and hard-gate on
-- (follows + opted-in), so the elevated role can't leak anything ungated.

create table if not exists public.mini_app_share (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  share_habits  boolean not null default false,
  share_fitness boolean not null default false,
  updated_at    timestamptz not null default now()
);

alter table public.mini_app_share enable row level security;
-- Owner manages their own opt-in row. Cross-user reads happen only through the
-- SECURITY DEFINER functions below, never directly.
create policy "own share prefs — select" on public.mini_app_share for select using (auth.uid() = user_id);
create policy "own share prefs — insert" on public.mini_app_share for insert with check (auth.uid() = user_id);
create policy "own share prefs — update" on public.mini_app_share for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Habits: self + followed-and-opted-in users, ranked by current best streak.
create or replace function public.following_habit_leaderboard()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  is_self      boolean,
  best_streak  int,
  entries_30d  int
)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select auth.uid() as user_id, true as is_self
    union
    select f.following_id, false
    from public.follows f
    join public.mini_app_share s on s.user_id = f.following_id and s.share_habits
    where f.follower_id = auth.uid()
  ),
  days as (
    select he.user_id, he.habit_client_id, he.date
    from public.habit_entry he
    join eligible e on e.user_id = he.user_id
  ),
  grouped as (
    select user_id, habit_client_id, date,
      date - (row_number() over (partition by user_id, habit_client_id order by date))::int as grp
    from days
  ),
  runs as (
    select user_id, habit_client_id, grp, count(*) as len, max(date) as run_end
    from grouped group by user_id, habit_client_id, grp
  ),
  cur as (
    select user_id, max(len) filter (where run_end >= current_date - 1) as best_streak
    from runs group by user_id
  ),
  ent as (
    select user_id, count(*) filter (where date > current_date - 30) as entries_30d
    from days group by user_id
  )
  select e.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color, e.is_self,
    coalesce(cur.best_streak, 0)::int, coalesce(ent.entries_30d, 0)::int
  from eligible e
  join public.profiles p on p.id = e.user_id
  left join cur on cur.user_id = e.user_id
  left join ent on ent.user_id = e.user_id
  order by coalesce(cur.best_streak, 0) desc, coalesce(ent.entries_30d, 0) desc, p.username;
$$;

-- Fitness: self + followed-and-opted-in users, ranked by this-week workouts.
create or replace function public.following_fitness_leaderboard()
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_color  text,
  is_self       boolean,
  workouts_week int,
  active_30d    int
)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select auth.uid() as user_id, true as is_self
    union
    select f.following_id, false
    from public.follows f
    join public.mini_app_share s on s.user_id = f.following_id and s.share_fitness
    where f.follower_id = auth.uid()
  ),
  logged as (
    select user_id, date from public.fitness_workout where user_id in (select user_id from eligible)
    union select user_id, date from public.fitness_meal where user_id in (select user_id from eligible)
    union select user_id, date from public.fitness_water where user_id in (select user_id from eligible)
  ),
  wk as (
    select user_id, count(*) as workouts_week
    from public.fitness_workout
    where user_id in (select user_id from eligible) and date >= date_trunc('week', current_date)::date
    group by user_id
  ),
  act as (
    select user_id, count(distinct date) as active_30d
    from logged where date > current_date - 30 group by user_id
  )
  select e.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color, e.is_self,
    coalesce(wk.workouts_week, 0)::int, coalesce(act.active_30d, 0)::int
  from eligible e
  join public.profiles p on p.id = e.user_id
  left join wk on wk.user_id = e.user_id
  left join act on act.user_id = e.user_id
  order by coalesce(wk.workouts_week, 0) desc, coalesce(act.active_30d, 0) desc, p.username;
$$;
