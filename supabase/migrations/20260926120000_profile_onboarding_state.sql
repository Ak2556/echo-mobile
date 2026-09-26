-- Record onboarding explicitly, because the signal it was inferred from is
-- always true.
--
-- lib/auth/listener.ts decided the route with:
--
--     const hasUsername = Boolean(profile?.username);
--     status: hasUsername ? 'ready' : 'needs-onboarding'
--
-- but handle_new_user() fills username on every signup, from metadata when the
-- provider sends it and otherwise from a fallback chain that terminates in a
-- value derived from new.id — that is the whole point of
-- 20260917130000_fix_signup_profile_creation, which restored those fallbacks
-- after their loss killed signup for five weeks. username is therefore never
-- null, hasUsername is never false, and 'needs-onboarding' has been dead code.
--
-- The consequence is not cosmetic. A first-time Google or Apple user is routed
-- straight to /(tabs)/home and never sees the wizard, so they pick no
-- interests and follow nobody. Interests are what seed the taste vector
-- (20260923160000_interests_seed_taste), which is why personalisation has
-- nothing to work with. The wizard is currently reachable only by explicitly
-- tapping "Sign up with Email".
--
-- So: an explicit column. Null means the wizard has not been completed.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Backfill BEFORE any client reads it. Every existing profile predates this
-- column, and the routing change treats null as "not onboarded" — without this
-- the next launch marches every current user into the signup wizard, where
-- step 3 overwrites the display name and username they already have.
--
-- created_at rather than now() so the value keeps meaning something: it is an
-- assertion that the account was already established, not that it onboarded
-- the moment this migration ran.
--
-- This does mark accounts that genuinely skipped the wizard — the Google and
-- Apple users described above — as onboarded. That is deliberate. Nothing on
-- the row distinguishes them from someone who finished, and pushing existing
-- users back through signup to collect interests would cost more than it
-- returns. They are reached by the date-of-birth gate instead.
update public.profiles
   set onboarded_at = coalesce(created_at, now())
 where onboarded_at is null;

-- 20260622100000_identity_surface_hardening revoked table-level
-- select/insert/update, so every client-touched column needs its own grant.
-- 20260705000000 exists because that was missed for every column added after
-- it, and 20260924120000 exists because it was missed again for date_of_birth.
--
-- INSERT is granted as well as UPDATE, and that is not belt-and-braces: the
-- wizard writes through `supabase.from('profiles').upsert({...})`, which is an
-- INSERT ... ON CONFLICT DO UPDATE. Postgres checks column INSERT privileges
-- on the statement's target list whether or not the conflict path is taken, so
-- an update-only grant fails the write even though the row always exists.
grant select (onboarded_at) on public.profiles to authenticated;
grant insert (onboarded_at) on public.profiles to authenticated;
grant update (onboarded_at) on public.profiles to authenticated;

-- The same upsert names date_of_birth. 20260924120000 granted UPDATE on it and
-- stopped there, which fixes a plain update and leaves the wizard's upsert
-- failing with "permission denied for table profiles" for anyone who supplies
-- a date — the exact symptom that migration set out to remove.
--
-- SELECT stays revoked, so this does not make the value readable by clients.
-- trg_validate_date_of_birth still runs BEFORE INSERT OR UPDATE and rejects
-- future, implausible and under-age dates, so granting the column adds no way
-- to lie about it.
grant insert (date_of_birth) on public.profiles to authenticated;
