-- Restore signup for every provider that does not send a username.
--
-- public.profiles.username and .display_name are NOT NULL, and
-- profiles.username is UNIQUE. handle_new_user() fills both from
-- raw_user_meta_data on the auth.users insert, inside a SECURITY DEFINER
-- trigger — so anything it raises aborts the signup and GoTrue reports
-- "Database error saving new user", with nothing pointing at this function.
--
-- 20260525180000 had this right: coalesce down to the email local-part, then
-- to a uuid-derived name. 20260810090000_fix_new_user_trigger re-emitted the
-- body without those fallbacks, and reverted it to bare
-- `raw_user_meta_data->>'username'`. Since 2026-08-10 the only signup that can
-- succeed is one where the client explicitly passes both keys:
--
--   Google / Apple  send name, full_name, email, avatar_url, sub — never
--                   username, never display_name. Always failed.
--   Phone OTP       has no email and no metadata at all. Always failed.
--   Email OTP       passes neither unless the caller sets options.data.
--
-- Restoring the old body is not enough, for two reasons it did not cover:
--
--   1. display_name fell back only to the email local-part, so a phone signup
--      (email null) still hit the NOT NULL.
--   2. username fell back to the email local-part with no regard for the
--      UNIQUE index, so the second person to sign up as name@other-host failed
--      on profiles_username_key. `on conflict (id)` does not catch that — it is
--      a different constraint.
--
-- So: every fallback ends at a value derived from new.id, which cannot be
-- null, and the username is probed against the unique index before insert.
-- The loop is bounded; the uuid-derived name is unique in practice and the
-- suffix only settles ties on a human-readable name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  v_username text;
  v_display  text;
  v_candidate text;
  v_n int := 0;
begin
  -- Trim and treat '' as absent: a provider sending an empty string is not
  -- supplying a name, and '' would fail the NOT NULL check just as null does.
  v_username := nullif(btrim(coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  )), '');

  v_display := nullif(btrim(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    v_username,
    ''
  )), '');

  v_username := coalesce(v_username, v_fallback);
  v_display  := coalesce(v_display,  v_username);

  -- Settle a collision on the UNIQUE index rather than letting it abort signup.
  v_candidate := v_username;
  while exists (select 1 from public.profiles p where p.username = v_candidate) loop
    v_n := v_n + 1;
    if v_n > 50 then
      v_candidate := v_fallback || '_' || substr(md5(random()::text), 1, 6);
      exit;
    end if;
    v_candidate := v_username || '_' || v_n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_candidate, v_display)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row for a new auth.users record. Every fallback terminates in a value derived from new.id, because both target columns are NOT NULL and a raise here aborts the signup.';
