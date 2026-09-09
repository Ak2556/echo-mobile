-- Column grants for profiles.allow_downloads (added in 20260908200000).
--
-- public.profiles has column-level grants — 20260622100000 revoked the
-- table-level ones — so a single ungranted column fails the ENTIRE select with
-- 42501 "permission denied for table profiles". Adding the column to
-- PROFILE_SELECT without this would have broken every screen that reads a
-- profile, the same way last_seen_at did in 20260815121000. The repo's
-- profilesColumnGrants test caught it before it shipped.
--
-- authenticated only, matching the other privacy toggles in 20260705000000:
-- PROFILE_SELECT already carries authenticated-only columns, so anon cannot run
-- that query in any case, and there is nothing anon needs this for.
grant select (allow_downloads) on public.profiles to authenticated;

-- Settings sync writes this to the caller's own row. The RLS update policy
-- already restricts writes to auth.uid() = id, so the grant does not widen who
-- can change it — without it, turning the toggle off would fail outright.
grant update (allow_downloads) on public.profiles to authenticated;
