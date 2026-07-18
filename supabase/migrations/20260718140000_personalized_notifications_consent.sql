-- Personalized-notifications consent — Stage 2 gate.
--
-- Server-side profiling (learning a user's best notification hour + interests
-- to time/target pushes) is behavioral profiling under the DSA/GDPR, so it is
-- strictly opt-IN: this column defaults to false and nothing server-side may
-- profile or target a user until they flip it on in Settings.

alter table public.profiles
  add column if not exists personalized_notifications boolean not null default false;

comment on column public.profiles.personalized_notifications is
  'DSA/GDPR: explicit opt-in for behavioral profiling that personalizes notification timing and content. Default false; only consented users are processed by the personalized fan-out.';
