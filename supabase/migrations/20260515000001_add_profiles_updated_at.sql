-- Add missing updated_at column to profiles table
alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

-- Also check for any other columns the signup wizard uses
-- interests is stored locally only, no DB column needed
