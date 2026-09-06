-- Remote kill switch.
--
-- lib/featureFlags.ts stays as the compiled DEFAULT; this table is an override
-- layer on top of it. That ordering is the whole safety property: an
-- unreachable database, a corrupt cache or a flag with no row all resolve to
-- what shipped. A design that treated this table as the source of truth would
-- turn one bad network into an app with no features.
--
-- Writable only through the dashboard or the service role. Nothing in the app
-- needs to write here, and a client that could flip another user's flags would
-- be a privilege escalation.
create table if not exists public.feature_flags (
  key        text        primary key,
  enabled    boolean     not null,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Readable signed-out as well as signed-in: the flag set gates the shell the
-- user lands in, so it has to resolve before auth does.
drop policy if exists "anyone reads feature flags" on public.feature_flags;
create policy "anyone reads feature flags"
  on public.feature_flags for select
  to anon, authenticated
  using (true);

-- Seeded from the compiled defaults as of 2026-09-06, so the first fetch after
-- release is a no-op rather than a surprise change of shape.
insert into public.feature_flags (key, enabled, note) values
  ('dailyQuestion', true,  'Daily-question banner on Discover'),
  ('salons',        false, 'Salons browse/create'),
  ('officeHours',   false, 'Office hours list + RSVP'),
  ('yearInEcho',    false, 'Annual recap'),
  ('quests',        false, 'Quests with XP'),
  ('badges',        false, 'Achievement badges'),
  ('stories',       false, 'Ephemeral 24h stories'),
  ('miniApps',      true,  'Productivity mini-apps'),
  ('liveAudio',     false, 'LiveKit audio rooms')
on conflict (key) do nothing;

comment on table public.feature_flags is
  'Remote overrides for lib/featureFlags.ts. Flip a row to disable a feature without a build. See docs/runbook/monitoring.md.';
