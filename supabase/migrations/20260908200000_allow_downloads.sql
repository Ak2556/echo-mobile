-- Author control over whether their media may be saved to another user's device.
--
-- Default true: the download action has to exist for the feature to mean
-- anything, and every surface reads this column before offering it, so a user
-- who turns it off is respected everywhere without a backfill.
--
-- Deliberately on profiles rather than echoes: the decision people expressed is
-- about their content as a whole, not per post. A per-echo override can be added
-- later as a nullable column that falls back to this one.
alter table public.profiles
  add column if not exists allow_downloads boolean not null default true;

comment on column public.profiles.allow_downloads is
  'Author opt-out for offline saving. When false, clients must not offer to download this user''s media.';
