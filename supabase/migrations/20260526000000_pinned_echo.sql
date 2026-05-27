-- Pinned signature echo on profiles.
--
-- A user can mark ONE of their published echoes as their pinned signature.
-- This echo renders at the top of their profile's Echoes tab, with a
-- "📌 Pinned" chip in the card header.
--
-- Design notes:
--   • One pin per user (a plain column on profiles, not a join table).
--   • ON DELETE SET NULL — if the pinned echo is later deleted, the pin
--     just clears instead of leaving a dangling reference.
--   • Nullable — most users won't pin anything; the column stays empty.
--   • No CHECK that the echo belongs to the same user. The RLS policy on
--     `profiles.update` (auth.uid() = id) already prevents pinning someone
--     else's content because you can only update your own profile row.

alter table public.profiles
  add column if not exists pinned_echo_id uuid
  references public.public_echoes(id) on delete set null;

-- Helpful index for "who has pinned what" queries (rare, but cheap).
create index if not exists profiles_pinned_echo_id_idx
  on public.profiles (pinned_echo_id)
  where pinned_echo_id is not null;
