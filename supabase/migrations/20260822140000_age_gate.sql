-- Age gate.
--
-- WHY
-- Echo had no age or date-of-birth field anywhere in the schema, while the
-- Terms claimed a 16+ minimum and the app served advertising and personalised
-- notifications to everyone. India's DPDP Act 2023 treats anyone under 18 as a
-- child: processing their data needs verifiable parental consent, and tracking,
-- behavioural monitoring and targeted advertising directed at them are
-- prohibited. None of that was enforceable without knowing the user's age.
--
-- WHAT THIS DOES
--   1. Stores date_of_birth on profiles, readable only by the owner.
--   2. Derives age server-side so the client cannot claim to be an adult.
--   3. Forces personalised notifications off for minors, and keeps them off.
--   4. Exposes is_adult()/can_be_profiled() for the ads and fan-out paths.
--
-- TWO THRESHOLDS, DELIBERATELY SEPARATE
--   16  the Terms' minimum age to hold an account at all.
--   18  the DPDP child threshold. Between 16 and 18 an account is allowed but
--       must not be profiled or advertised to.
-- Counsel may raise the floor to 18 for India; that is a one-line change to
-- MINIMUM_AGE_YEARS below and to constants/legal/ageGate.ts. Nothing else moves.

-- ── 1. the column ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists date_of_birth date,
  -- When the user supplied it. Null means "never asked" (an account created
  -- before this migration) as opposed to "declined".
  add column if not exists age_collected_at timestamptz;

comment on column public.profiles.date_of_birth is
  'Date of birth, self-declared at signup. Readable only by the owner (see the '
  'profiles_self_read_dob policy). Used to derive age for the DPDP Act 2023 '
  'child threshold; never exposed on the public profile.';

create index if not exists idx_profiles_dob_null
  on public.profiles (id) where date_of_birth is null;

-- ── 2. server-side age derivation ───────────────────────────────────────────
-- SECURITY DEFINER so callers cannot read another user's DOB through it; it
-- returns only the derived answer, never the date.
create or replace function public.user_age_years(p_uid uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p.date_of_birth is null then null
           else extract(year from age(current_date, p.date_of_birth))::int
         end
  from public.profiles p
  where p.id = p_uid;
$$;

comment on function public.user_age_years is
  'Age in whole years, or null when the user has no recorded date of birth.';

-- The Terms minimum. Change here AND in constants/legal/ageGate.ts together.
create or replace function public.minimum_age_years()
returns integer language sql immutable as $$ select 16 $$;

-- The DPDP child threshold.
create or replace function public.adult_age_years()
returns integer language sql immutable as $$ select 18 $$;

create or replace function public.is_adult(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.user_age_years(p_uid) >= public.adult_age_years(), false);
$$;

comment on function public.is_adult is
  'True only when a date of birth is on file AND the user is 18 or older. '
  'Unknown age is treated as NOT adult, so an account that predates the age '
  'gate is handled as a minor until it supplies a date of birth.';

-- The single question the ads and fan-out paths should ask.
create or replace function public.can_be_profiled(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_adult(p_uid);
$$;

comment on function public.can_be_profiled is
  'Whether this user may be shown targeted advertising or have their behaviour '
  'profiled for personalised notifications. Fails closed on unknown age.';

grant execute on function public.user_age_years  to authenticated;
grant execute on function public.is_adult        to authenticated;
grant execute on function public.can_be_profiled to authenticated;
grant execute on function public.minimum_age_years to authenticated, anon;
grant execute on function public.adult_age_years   to authenticated, anon;

-- ── 3. date of birth is private, even from other signed-in users ────────────
-- profiles rows are broadly readable; the DOB column must not be.
revoke select (date_of_birth) on public.profiles from anon, authenticated;
grant select (date_of_birth) on public.profiles to service_role;

-- ── 4. reject impossible and under-age dates at write time ──────────────────
create or replace function public.validate_date_of_birth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_age integer;
begin
  if new.date_of_birth is null then
    return new;
  end if;

  if new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future';
  end if;
  if new.date_of_birth < current_date - interval '120 years' then
    raise exception 'date_of_birth is not a plausible date';
  end if;

  v_age := extract(year from age(current_date, new.date_of_birth))::int;
  if v_age < public.minimum_age_years() then
    raise exception 'Echo requires a minimum age of % years', public.minimum_age_years()
      using errcode = 'check_violation';
  end if;

  -- Under the DPDP child threshold: no behavioural profiling, regardless of
  -- what the client asked for. Enforced here so it cannot be bypassed by
  -- writing the column directly.
  if v_age < public.adult_age_years() then
    new.personalized_notifications := false;
  end if;

  if new.date_of_birth is distinct from old.date_of_birth then
    new.age_collected_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_date_of_birth on public.profiles;
create trigger trg_validate_date_of_birth
  before insert or update of date_of_birth, personalized_notifications
  on public.profiles
  for each row execute function public.validate_date_of_birth();

-- ── 5. keep profiling off for minors on any later write ─────────────────────
create or replace function public.enforce_minor_profiling_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.personalized_notifications
     and not coalesce(
       extract(year from age(current_date, new.date_of_birth))::int
         >= public.adult_age_years(), false)
  then
    new.personalized_notifications := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_minor_profiling_off on public.profiles;
create trigger trg_enforce_minor_profiling_off
  before insert or update of personalized_notifications
  on public.profiles
  for each row execute function public.enforce_minor_profiling_off();

-- ── 6. back-fill safety ─────────────────────────────────────────────────────
-- Existing accounts have no DOB, so is_adult() returns false for them and they
-- are treated as minors: no targeted ads, no personalised notifications, until
-- they supply a date of birth. That is the fail-closed direction.
update public.profiles
   set personalized_notifications = false
 where date_of_birth is null
   and personalized_notifications;
