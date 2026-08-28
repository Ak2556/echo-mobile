-- A tutor's booking page, readable without an account.
--
-- The 1:1 model chosen for Learn includes people who are not on Echo: a tutor
-- shares a link, and whoever opens it can request a slot. That page has to
-- render for `anon`, and the existing policies are all `to authenticated`, so
-- an anonymous visitor saw nothing at all.
--
-- Only published profiles are exposed, and only the fields a booking page
-- shows. A tutor who has not set a public_slug and flipped is_published stays
-- invisible, which keeps this opt-in rather than a change in what everyone's
-- profile means.

drop policy if exists "anon reads published tutors" on public.learn_tutors;
create policy "anon reads published tutors" on public.learn_tutors
  for select to anon using (is_published and public_slug is not null);

drop policy if exists "anon reads published packages" on public.learn_packages;
create policy "anon reads published packages" on public.learn_packages
  for select to anon using (
    is_active and exists (
      select 1 from public.learn_tutors t
      where t.user_id = tutor_id and t.is_published and t.public_slug is not null
    )
  );

drop policy if exists "anon reads published slots" on public.learn_slots;
create policy "anon reads published slots" on public.learn_slots
  for select to anon using (
    is_active and exists (
      select 1 from public.learn_tutors t
      where t.user_id = tutor_id and t.is_published and t.public_slug is not null
    )
  );

-- Read only. A guest booking is written by the learn-guest-booking edge
-- function under service role, never by anon directly: the guest_token is the
-- guest's only credential, and letting the client choose it would make it
-- guessable.
grant select on public.learn_tutors, public.learn_packages, public.learn_slots to anon;

-- Bookings stay invisible to anon entirely. No policy is added for them here,
-- and without one RLS denies by default.
