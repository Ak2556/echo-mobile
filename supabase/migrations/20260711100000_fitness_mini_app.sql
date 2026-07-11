-- Fitness joins the synced mini-apps (meals, workouts, body-weight log).
-- Unlike the first three, its document is a JSONB object of collections
-- rather than a bare array — the column is already generic jsonb, only the
-- app whitelist needs widening.

alter table public.mini_app_data
  drop constraint if exists mini_app_data_app_check;

alter table public.mini_app_data
  add constraint mini_app_data_app_check
  check (app in ('notes', 'habits', 'expenses', 'fitness'));
