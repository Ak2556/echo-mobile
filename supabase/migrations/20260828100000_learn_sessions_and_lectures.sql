-- Learn: real 1:1 sessions and real lecture media.
--
-- The Learn mini-app already had a complete 1:1 domain layer — tutor profile,
-- packages, bookable slots, a booking state machine, payment status, meeting
-- link, prep note, homework, follow-up — written as pure functions over a
-- LearningGoal and persisted to AsyncStorage. None of it had any UI, and
-- because it lived on one device a "booking" was a note to yourself: the other
-- person could never see it. Lectures were a free-text string.
--
-- These tables are the second side of that. The domain logic carries over
-- almost unchanged; what changes is that a booking now has two parties, and a
-- lecture is a file somebody can actually watch.
--
-- Guests are first-class here. A tutor can share a public link and someone
-- without an Echo account can request a slot, so `learner_id` is nullable and a
-- guest row is identified by an unguessable `guest_token` instead. That token
-- is the guest's only credential, which is why guest bookings are written by an
-- edge function under service role rather than by any client-side policy.

-- ── tutors ──────────────────────────────────────────────────────────────────
create table if not exists public.learn_tutors (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  headline     text not null default '',
  bio          text not null default '',
  subjects     text[] not null default '{}',
  hourly_rate  numeric(10,2),
  currency     text not null default 'INR',
  timezone     text not null default 'Asia/Kolkata',
  is_published boolean not null default false,
  -- Only set when the tutor opts into a shareable public booking page.
  public_slug  text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── what a tutor sells ──────────────────────────────────────────────────────
create table if not exists public.learn_packages (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references public.learn_tutors(user_id) on delete cascade,
  title      text not null,
  sessions   int  not null default 1  check (sessions between 1 and 100),
  minutes    int  not null default 60 check (minutes between 5 and 480),
  price      numeric(10,2),
  currency   text not null default 'INR',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_learn_packages_tutor on public.learn_packages(tutor_id);

-- ── recurring weekly availability ───────────────────────────────────────────
-- Stored as weekday + minute-of-day in the tutor's own timezone rather than as
-- concrete timestamps: availability is a rule, and materialising it into rows
-- would mean regenerating them forever.
create table if not exists public.learn_slots (
  id               uuid primary key default gen_random_uuid(),
  tutor_id         uuid not null references public.learn_tutors(user_id) on delete cascade,
  weekday          smallint not null check (weekday between 0 and 6),
  start_minute     int not null check (start_minute between 0 and 1439),
  duration_minutes int not null default 60 check (duration_minutes between 5 and 480),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_learn_slots_tutor on public.learn_slots(tutor_id);

-- ── bookings ────────────────────────────────────────────────────────────────
create table if not exists public.learn_bookings (
  id               uuid primary key default gen_random_uuid(),
  tutor_id         uuid not null references public.learn_tutors(user_id) on delete cascade,
  -- null when the request came through the public link from someone with no
  -- Echo account.
  learner_id       uuid references auth.users(id) on delete set null,
  guest_name       text,
  guest_email      text,
  guest_token      text unique,
  package_id       uuid references public.learn_packages(id) on delete set null,
  slot_id          uuid references public.learn_slots(id) on delete set null,
  scheduled_for    timestamptz,
  duration_minutes int not null default 60,
  status           text not null default 'requested'
                   check (status in ('requested','accepted','scheduled','completed','cancelled')),
  payment_status   text not null default 'unpaid'
                   check (payment_status in ('unpaid','pending','paid','refunded')),
  -- Room name for the in-app meeting; the livekit-token function issues access
  -- to exactly this room. meeting_link is the external fallback.
  meeting_room     text,
  meeting_link     text,
  prep_note        text,
  homework         text,
  follow_up        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Every booking has a learner of some kind.
  constraint learn_bookings_has_party
    check (learner_id is not null or (guest_name is not null and guest_token is not null))
);
create index if not exists idx_learn_bookings_tutor   on public.learn_bookings(tutor_id, scheduled_for desc);
create index if not exists idx_learn_bookings_learner on public.learn_bookings(learner_id, scheduled_for desc);

-- ── lectures ────────────────────────────────────────────────────────────────
-- Uploads live in R2 (no egress charge, which is the whole reason video is
-- affordable here); `r2_key` is the object key. Links carry an external URL
-- instead. Exactly one of the two is set.
create table if not exists public.learn_lectures (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  source         text not null check (source in ('upload','link')),
  r2_key         text,
  external_url   text,
  duration_seconds int,
  size_bytes     bigint,
  thumbnail_url  text,
  visibility     text not null default 'private'
                 check (visibility in ('private','learners','public')),
  created_at     timestamptz not null default now(),
  constraint learn_lectures_source_shape check (
    (source = 'upload' and r2_key is not null and external_url is null) or
    (source = 'link'   and external_url is not null and r2_key is null)
  )
);
create index if not exists idx_learn_lectures_owner on public.learn_lectures(owner_id, created_at desc);

-- ── notes taken against a lecture or a session ──────────────────────────────
-- `at_seconds` makes a note a timestamp on the video, so it can be tapped to
-- jump back to the moment it was written.
create table if not exists public.learn_lecture_notes (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users(id) on delete cascade,
  lecture_id  uuid references public.learn_lectures(id) on delete cascade,
  booking_id  uuid references public.learn_bookings(id) on delete cascade,
  at_seconds  int,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint learn_notes_has_subject check (lecture_id is not null or booking_id is not null)
);
create index if not exists idx_learn_notes_author  on public.learn_lecture_notes(author_id, created_at desc);
create index if not exists idx_learn_notes_lecture on public.learn_lecture_notes(lecture_id, at_seconds);

-- ── row level security ──────────────────────────────────────────────────────
alter table public.learn_tutors        enable row level security;
alter table public.learn_packages      enable row level security;
alter table public.learn_slots         enable row level security;
alter table public.learn_bookings      enable row level security;
alter table public.learn_lectures      enable row level security;
alter table public.learn_lecture_notes enable row level security;

-- Tutors: a published profile is discoverable; your own is always yours.
drop policy if exists "published tutors are readable" on public.learn_tutors;
create policy "published tutors are readable" on public.learn_tutors
  for select to authenticated using (is_published or user_id = auth.uid());

drop policy if exists "own tutor profile write" on public.learn_tutors;
create policy "own tutor profile write" on public.learn_tutors
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Packages and slots follow their tutor's visibility.
drop policy if exists "packages of published tutors" on public.learn_packages;
create policy "packages of published tutors" on public.learn_packages
  for select to authenticated using (
    tutor_id = auth.uid()
    or exists (select 1 from public.learn_tutors t where t.user_id = tutor_id and t.is_published)
  );

drop policy if exists "own packages write" on public.learn_packages;
create policy "own packages write" on public.learn_packages
  for all to authenticated using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

drop policy if exists "slots of published tutors" on public.learn_slots;
create policy "slots of published tutors" on public.learn_slots
  for select to authenticated using (
    tutor_id = auth.uid()
    or exists (select 1 from public.learn_tutors t where t.user_id = tutor_id and t.is_published)
  );

drop policy if exists "own slots write" on public.learn_slots;
create policy "own slots write" on public.learn_slots
  for all to authenticated using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- Bookings are visible to exactly the two parties.
drop policy if exists "booking parties read" on public.learn_bookings;
create policy "booking parties read" on public.learn_bookings
  for select to authenticated using (tutor_id = auth.uid() or learner_id = auth.uid());

drop policy if exists "learner requests a booking" on public.learn_bookings;
create policy "learner requests a booking" on public.learn_bookings
  for insert to authenticated with check (
    learner_id = auth.uid()
    and exists (select 1 from public.learn_tutors t where t.user_id = tutor_id and t.is_published)
  );

drop policy if exists "booking parties update" on public.learn_bookings;
create policy "booking parties update" on public.learn_bookings
  for update to authenticated
  using (tutor_id = auth.uid() or learner_id = auth.uid())
  with check (tutor_id = auth.uid() or learner_id = auth.uid());

-- Lectures: yours always; public to everyone; 'learners' to anyone who has a
-- live booking with you. A cancelled booking does not keep the library open.
drop policy if exists "lecture visibility" on public.learn_lectures;
create policy "lecture visibility" on public.learn_lectures
  for select to authenticated using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'learners' and exists (
      select 1 from public.learn_bookings b
      where b.tutor_id = owner_id
        and b.learner_id = auth.uid()
        and b.status in ('accepted','scheduled','completed')
    ))
  );

drop policy if exists "own lectures write" on public.learn_lectures;
create policy "own lectures write" on public.learn_lectures
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Notes are private to whoever wrote them, including from the tutor.
drop policy if exists "own notes" on public.learn_lecture_notes;
create policy "own notes" on public.learn_lecture_notes
  for all to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

grant select, insert, update, delete on
  public.learn_tutors, public.learn_packages, public.learn_slots,
  public.learn_bookings, public.learn_lectures, public.learn_lecture_notes
  to authenticated;
