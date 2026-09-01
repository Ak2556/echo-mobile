-- SECURITY: the age gate's own helpers bypassed the age gate.
--
-- 20260822140000_age_gate.sql protects the date of birth with a column privilege:
--     revoke select (date_of_birth) on public.profiles from anon, authenticated;
-- and then, a few lines later, defines user_age_years(p_uid uuid default auth.uid())
-- as SECURITY DEFINER and grants it to authenticated. SECURITY DEFINER executes as
-- the owner, which still holds the column privilege, and the body filters on the
-- CALLER-SUPPLIED p_uid with no check that it is the caller's own id — the
-- `default auth.uid()` is only a default. The helper therefore walks straight
-- through the control declared three lines above it.
--
-- is_adult() and can_be_profiled() are thin wrappers over user_age_years(), so
-- both inherit the flaw. Demonstrated on production (inside a rolled-back
-- transaction): an ordinary authenticated user calling
--     user_age_years('<another user id>')
-- received 17, with is_adult false and can_be_profiled false — the exact age and
-- minor status of an unrelated account. That is minor enumeration, in a migration
-- whose stated purpose is DPDP child protection.
--
-- Two further facts found while verifying:
--   * The ACL was `=X/postgres` — the PUBLIC grant — so anon could call these too,
--     not merely authenticated. The anon key ships inside the app bundle, so no
--     account was needed.
--   * That migration's comment claims the DOB is "readable only by the owner" via
--     a `profiles_self_read_dob` policy. No such policy exists; the column revoke
--     was the only control, and these functions bypassed it.
--
-- Nothing leaked in practice yet: no production profile has a date_of_birth today,
-- because the age gate shipped after every current user signed up. The hole arms
-- itself on the first post-age-gate signup.
--
-- Fix, applied at the root so all three inherit it: user_age_years returns a row
-- only when the caller is asking about themselves, or is the service role (which
-- has no auth.uid() of its own). An unauthorised caller gets no row, hence NULL,
-- hence is_adult false and can_be_profiled false — fail-closed, matching the
-- gate's existing "unknown age is not an adult" stance. Kept as `language sql`
-- and STABLE by expressing the guard as a WHERE predicate, so no call site
-- changes behaviour.
--
-- The only internal caller is get_personal_feed, which passes its own v_uid
-- (already derived from auth.uid()), and is SECURITY DEFINER so it executes as
-- owner regardless of the EXECUTE grants below. Verified before writing this.

create or replace function public.user_age_years(p_uid uuid default auth.uid())
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
           when p.date_of_birth is null then null
           else extract(year from age(current_date, p.date_of_birth))::int
         end
  from public.profiles p
  where p.id = p_uid
    and (
      p_uid = auth.uid()
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    );
$function$;

-- Defence in depth: these are self-service predicates, not public utilities.
-- PUBLIC and anon have no business calling them at all.
revoke execute on function public.user_age_years(uuid)  from public, anon;
revoke execute on function public.is_adult(uuid)        from public, anon;
revoke execute on function public.can_be_profiled(uuid) from public, anon;

grant execute on function public.user_age_years(uuid)  to authenticated, service_role;
grant execute on function public.is_adult(uuid)        to authenticated, service_role;
grant execute on function public.can_be_profiled(uuid) to authenticated, service_role;

comment on function public.user_age_years is
  'Age in years for a user. Returns NULL unless the caller is asking about '
  'themselves or is the service role — SECURITY DEFINER would otherwise bypass '
  'the date_of_birth column revoke for any uuid the caller supplies.';
