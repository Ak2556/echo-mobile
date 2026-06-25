-- Add privacy preference columns to profiles so settings sync across devices.
-- All default to the "open" state so existing users are unaffected.
alter table public.profiles
  add column if not exists is_private      boolean not null default false,
  add column if not exists dm_privacy      text    not null default 'everyone'
    check (dm_privacy in ('everyone', 'followers', 'nobody')),
  add column if not exists activity_status boolean not null default true,
  add column if not exists online_status   boolean not null default true,
  add column if not exists read_receipts   boolean not null default true;
