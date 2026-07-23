-- Cross-app progress in one round-trip: the best habit streak, this-week
-- workouts + today's calories, this-month net spend, and open/due tasks — all
-- from the structured tables, owner-scoped (security invoker → RLS applies).
-- Powers a unified "across your tools" summary without four separate calls.

create or replace function public.target_progress(p_user uuid default auth.uid())
returns table (
  habit_best_streak      int,
  habit_active           int,
  fitness_workouts_week  int,
  fitness_calories_today numeric,
  expense_net_month      numeric,
  expense_currency       text,
  tasks_open             int,
  tasks_due_today        int
)
language sql stable security invoker as $$
  with days as (
    select habit_client_id, date,
      date - (row_number() over (partition by habit_client_id order by date))::int as grp
    from public.habit_entry where user_id = p_user
  ),
  runs as (
    select habit_client_id, grp, count(*) as len, max(date) as run_end
    from days group by habit_client_id, grp
  ),
  hstreak as (
    select coalesce(max(len) filter (where run_end >= current_date - 1), 0)::int as best from runs
  )
  select
    (select best from hstreak),
    (select count(*)::int from public.habit where user_id = p_user and not archived),
    (select count(*)::int from public.fitness_workout where user_id = p_user and date >= date_trunc('week', current_date)::date),
    coalesce((select sum(calories) from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((
      select sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date)
           - sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date)
      from public.expense_tx where user_id = p_user
    ), 0),
    (select currency from public.expense_settings where user_id = p_user),
    (select count(*)::int from public.task_item where user_id = p_user and not done),
    (select count(*)::int from public.task_item where user_id = p_user and not done and due = current_date);
$$;
