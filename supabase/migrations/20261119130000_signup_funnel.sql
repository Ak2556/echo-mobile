-- Sign-up completion for ops-probe.
--
-- From 2026-09-30 to 2026-11-19 no new account could finish signing up (the
-- wizard's final save lacked a column grant, fixed in 20261119120000) and
-- nothing noticed for seven weeks. ops-probe now checks the outcome every run:
-- of the most recent verified sign-ups, did any finish?
--
-- The most recent p_last, not a time window: Echo gets a few sign-ups a month.
-- "Verified" (the person entered their code) needs auth.users.last_sign_in_at,
-- which the probe's PostgREST client cannot read, hence SECURITY DEFINER. It
-- returns two counts and nothing about any person. Only service_role may call it.
create or replace function public.signup_funnel(p_since timestamptz, p_before timestamptz, p_last integer)
returns table (started bigint, finished bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)                                       as started,
         count(*) filter (where r.onboarded_at is not null) as finished
    from (
      select p.onboarded_at
        from public.profiles p
        join auth.users u on u.id = p.id
       where p.created_at >= p_since
         and p.created_at <  p_before
         and u.last_sign_in_at is not null
       order by p.created_at desc
       limit greatest(1, least(p_last, 50))
    ) r;
$$;

revoke all on function public.signup_funnel(timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.signup_funnel(timestamptz, timestamptz, integer) to service_role;

comment on function public.signup_funnel(timestamptz, timestamptz, integer) is
  'ops-probe: of the latest p_last verified sign-ups created in [p_since, p_before), how many finished onboarding. Counts only; service_role only.';
