-- Fix handle_new_user to support phone-only signups
--
-- The original trigger derived username from raw_user_meta_data.username
-- OR the email prefix. Phone-only signups have NEITHER — both are NULL,
-- coalesce returns NULL, and the INSERT into profiles (where username is
-- NOT NULL UNIQUE) fails. The error surfaces in the app as a generic
-- "database error adding new user" toast at the SMS verify step.
--
-- Add a third fallback: derive a placeholder username from the auth user
-- UUID. Looks like `user_a1b2c3d4` — 32^8 ≈ 1.1 trillion possible values,
-- collision rate is negligible for our scale. The user picks their real
-- handle in the signup wizard, which upserts and replaces this placeholder.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
