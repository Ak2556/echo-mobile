-- Structured, queryable Fitness data — mirrors the local-first FitnessDoc blob
-- so the server can aggregate calories/macros, workout frequency, water, and
-- weight trends for insights, AI coaching, comparison, and notifications.
-- Owner-scoped RLS; blob (mini_app_data) stays authoritative for the offline UI.

create table if not exists public.fitness_meal (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  name       text not null,
  kind       text,
  calories   numeric not null default 0,
  protein    numeric not null default 0,
  carbs      numeric not null default 0,
  fat        numeric not null default 0,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.fitness_workout (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  title      text,
  exercises  jsonb not null default '[]',
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.fitness_water (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  ml         numeric not null default 0,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.fitness_weight (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  kg         numeric not null,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.fitness_measurement (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  client_id  text not null,
  fields     jsonb not null default '{}',
  date       date not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.fitness_goals (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  calories         numeric,
  protein          numeric,
  carbs            numeric,
  fat              numeric,
  water_ml         numeric,
  workouts_per_week int,
  updated_at       timestamptz not null default now()
);

create index if not exists fitness_meal_user_date_idx    on public.fitness_meal (user_id, date desc);
create index if not exists fitness_workout_user_date_idx on public.fitness_workout (user_id, date desc);
create index if not exists fitness_water_user_date_idx   on public.fitness_water (user_id, date desc);
create index if not exists fitness_weight_user_date_idx  on public.fitness_weight (user_id, date desc);

do $$
declare t text;
begin
  foreach t in array array['fitness_meal','fitness_workout','fitness_water','fitness_weight','fitness_measurement','fitness_goals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own %1$s — select" on public.%1$I for select using (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — insert" on public.%1$I for insert with check (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — update" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$, t);
    execute format($p$create policy "own %1$s — delete" on public.%1$I for delete using (auth.uid() = user_id)$p$, t);
  end loop;
end $$;

-- One-row summary the app / AI / comparison share instead of recomputing.
create or replace function public.fitness_stats(p_user uuid default auth.uid())
returns table (
  calories_today numeric,
  protein_today  numeric,
  water_today_ml numeric,
  workouts_week  int,
  latest_weight_kg numeric,
  log_streak     int
)
language sql stable security invoker as $$
  with logged_days as (
    select date from public.fitness_meal    where user_id = p_user
    union select date from public.fitness_workout where user_id = p_user
    union select date from public.fitness_water   where user_id = p_user
  ),
  streak as (
    select date, date - (row_number() over (order by date))::int as grp from logged_days
  ),
  runs as (
    select grp, count(*) len, max(date) run_end from streak group by grp
  )
  select
    coalesce((select sum(calories) from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((select sum(protein)  from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((select sum(ml)       from public.fitness_water where user_id = p_user and date = current_date), 0),
    coalesce((select count(*)::int from public.fitness_workout where user_id = p_user and date >= date_trunc('week', current_date)::date), 0),
    (select kg from public.fitness_weight where user_id = p_user order by date desc limit 1),
    coalesce((select len::int from runs where run_end >= current_date - 1 order by run_end desc limit 1), 0);
$$;
