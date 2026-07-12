-- Pomodoro joins the synced mini-apps: focus-session history + settings as
-- one JSONB doc per user, same model as fitness.

alter table public.mini_app_data
  drop constraint if exists mini_app_data_app_check;

alter table public.mini_app_data
  add constraint mini_app_data_app_check
  check (app in ('notes', 'habits', 'expenses', 'fitness', 'pomodoro'));
