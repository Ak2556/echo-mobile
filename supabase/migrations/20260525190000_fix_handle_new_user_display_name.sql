-- Round 2 of the phone-signup fix: profiles.display_name is also NOT NULL
-- (tightened by an out-of-band migration after the original schema). The
-- previous fix only added a username fallback; phone signups still crashed
-- the trigger with:
--
--   23502: null value in column "display_name" of relation "profiles"
--          violates not-null constraint
--
-- Mirror the same UUID-derived placeholder for display_name. The user
-- overrides this in step 0 of the signup wizard via profiles.upsert.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_handle text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1),
      fallback_handle
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1),
      fallback_handle
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
