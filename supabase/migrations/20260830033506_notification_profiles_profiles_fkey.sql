-- personalized-fanout embeds `profiles!inner(...)` in its select on
-- notification_profiles, but notification_profiles.user_id only had an FK to
-- auth.users — PostgREST needs a direct FK to public.profiles to build that
-- embed, so every cron invocation was failing with a 500 ("Could not find a
-- relationship between 'notification_profiles' and 'profiles'"), masked until
-- now by an unrelated 401 (missing vault secret, fixed separately).

alter table public.notification_profiles
  add constraint notification_profiles_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
