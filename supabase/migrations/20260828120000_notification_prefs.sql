-- Make the notification toggles do something.
--
-- Notification Preferences has offered six switches — likes, comments,
-- follows, direct messages, re-echoes, mentions — since it shipped. They were
-- written to the local settings store and read by nothing: not the client, not
-- push-fanout. Turning "likes" off changed no behaviour anywhere, and the only
-- lever that ever worked was revoking notification permission for the whole
-- app.
--
-- Kept as one jsonb column rather than six booleans so adding a seventh kind
-- later is a client change, not a migration plus a column grant. Absent keys
-- mean on, so an account that has never opened the screen behaves exactly as
-- it does today.
--
-- profiles has column-level SELECT grants (20260622100000 revoked the table
-- grant), and one ungranted column fails the WHOLE select with 42501. The
-- grants below are not optional; lib/profilesColumnGrants.test.ts fails
-- without them.

alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

grant select (notification_prefs) on public.profiles to authenticated;
grant update (notification_prefs) on public.profiles to authenticated;
