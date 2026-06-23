-- Echo social feature pack: schema for mentions, reactions, mood,
-- daily question, salons, co-echoes, office hours, badges, year-in-echo, quests.
-- All tables get RLS + sensible policies + counter triggers where applicable.
--
-- NOTE: This migration was applied to the remote project in chunks via MCP
-- (20260521093251 through 20260521093456). This consolidated file is the
-- source-of-truth for the schema and is idempotent — running it again is safe.

-- Profile extensions
alter table public.profiles
  add column if not exists pronouns text,
  add column if not exists mood text,
  add column if not exists mood_expires_at timestamptz;

-- Reaction counters on public_echoes
alter table public.public_echoes
  add column if not exists mind_blown_count   integer not null default 0,
  add column if not exists taking_notes_count integer not null default 0,
  add column if not exists agree_count        integer not null default 0,
  add column if not exists disagree_count     integer not null default 0,
  add column if not exists salon_id           uuid,
  add column if not exists co_author_id       uuid references auth.users (id) on delete set null,
  add column if not exists co_author_response text;

create index if not exists idx_public_echoes_salon
  on public.public_echoes (salon_id) where salon_id is not null;
create index if not exists idx_public_echoes_co_author
  on public.public_echoes (co_author_id) where co_author_id is not null;

-- Reaction counters on comments
alter table public.echo_comments
  add column if not exists mind_blown_count   integer not null default 0,
  add column if not exists taking_notes_count integer not null default 0,
  add column if not exists agree_count        integer not null default 0,
  add column if not exists disagree_count     integer not null default 0;

-- Mentions
create table if not exists public.echo_mentions (
  echo_id            uuid not null references public.public_echoes (id) on delete cascade,
  mentioned_user_id  uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (echo_id, mentioned_user_id)
);
create index if not exists idx_echo_mentions_user on public.echo_mentions (mentioned_user_id);

create table if not exists public.comment_mentions (
  comment_id         uuid not null references public.echo_comments (id) on delete cascade,
  mentioned_user_id  uuid not null references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);
create index if not exists idx_comment_mentions_user on public.comment_mentions (mentioned_user_id);

alter table public.echo_mentions enable row level security;
alter table public.comment_mentions enable row level security;

drop policy if exists "echo_mentions select all" on public.echo_mentions;
create policy "echo_mentions select all" on public.echo_mentions for select using (true);
drop policy if exists "echo_mentions insert by author" on public.echo_mentions;
create policy "echo_mentions insert by author" on public.echo_mentions
  for insert with check (
    exists (select 1 from public.public_echoes pe
            where pe.id = echo_id and pe.author_id = auth.uid())
  );
drop policy if exists "echo_mentions delete by author" on public.echo_mentions;
create policy "echo_mentions delete by author" on public.echo_mentions
  for delete using (
    exists (select 1 from public.public_echoes pe
            where pe.id = echo_id and pe.author_id = auth.uid())
  );

drop policy if exists "comment_mentions select all" on public.comment_mentions;
create policy "comment_mentions select all" on public.comment_mentions for select using (true);
drop policy if exists "comment_mentions insert by author" on public.comment_mentions;
create policy "comment_mentions insert by author" on public.comment_mentions
  for insert with check (
    exists (select 1 from public.echo_comments ec
            where ec.id = comment_id and ec.author_id = auth.uid())
  );

create or replace function public.notify_on_echo_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  select author_id into v_actor from public.public_echoes where id = new.echo_id;
  if v_actor is not null and v_actor <> new.mentioned_user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (new.mentioned_user_id, 'mention', v_actor, 'echo', new.echo_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_echo_mention on public.echo_mentions;
create trigger trg_notify_echo_mention
  after insert on public.echo_mentions
  for each row execute function public.notify_on_echo_mention();

create or replace function public.notify_on_comment_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_echo uuid;
begin
  select author_id, echo_id into v_actor, v_echo from public.echo_comments where id = new.comment_id;
  if v_actor is not null and v_actor <> new.mentioned_user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (new.mentioned_user_id, 'mention', v_actor, 'comment', new.comment_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_comment_mention on public.comment_mentions;
create trigger trg_notify_comment_mention
  after insert on public.comment_mentions
  for each row execute function public.notify_on_comment_mention();

-- Reactions (4-emoji set: mind_blown / taking_notes / agree / disagree)
create table if not exists public.echo_reactions (
  echo_id    uuid not null references public.public_echoes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reaction   text not null check (reaction in ('mind_blown', 'taking_notes', 'agree', 'disagree')),
  created_at timestamptz not null default now(),
  primary key (echo_id, user_id, reaction)
);
create index if not exists idx_echo_reactions_echo on public.echo_reactions (echo_id);
create index if not exists idx_echo_reactions_user on public.echo_reactions (user_id);

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.echo_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  reaction   text not null check (reaction in ('mind_blown', 'taking_notes', 'agree', 'disagree')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, reaction)
);
create index if not exists idx_comment_reactions_comment on public.comment_reactions (comment_id);
create index if not exists idx_comment_reactions_user on public.comment_reactions (user_id);

alter table public.echo_reactions enable row level security;
alter table public.comment_reactions enable row level security;

drop policy if exists "echo_reactions select all" on public.echo_reactions;
create policy "echo_reactions select all" on public.echo_reactions for select using (true);
drop policy if exists "echo_reactions insert own" on public.echo_reactions;
create policy "echo_reactions insert own" on public.echo_reactions
  for insert with check (auth.uid() = user_id);
drop policy if exists "echo_reactions delete own" on public.echo_reactions;
create policy "echo_reactions delete own" on public.echo_reactions
  for delete using (auth.uid() = user_id);

drop policy if exists "comment_reactions select all" on public.comment_reactions;
create policy "comment_reactions select all" on public.comment_reactions for select using (true);
drop policy if exists "comment_reactions insert own" on public.comment_reactions;
create policy "comment_reactions insert own" on public.comment_reactions
  for insert with check (auth.uid() = user_id);
drop policy if exists "comment_reactions delete own" on public.comment_reactions;
create policy "comment_reactions delete own" on public.comment_reactions
  for delete using (auth.uid() = user_id);

create or replace function public.adjust_echo_reaction_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text;
begin
  v_col := case
    when coalesce(new.reaction, old.reaction) = 'mind_blown'   then 'mind_blown_count'
    when coalesce(new.reaction, old.reaction) = 'taking_notes' then 'taking_notes_count'
    when coalesce(new.reaction, old.reaction) = 'agree'        then 'agree_count'
    when coalesce(new.reaction, old.reaction) = 'disagree'     then 'disagree_count'
    else null end;
  if v_col is null then return null; end if;
  if tg_op = 'INSERT' then
    execute format('update public.public_echoes set %I = coalesce(%I,0) + 1 where id = $1', v_col, v_col) using new.echo_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.public_echoes set %I = greatest(coalesce(%I,0) - 1, 0) where id = $1', v_col, v_col) using old.echo_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_echo_reaction_count on public.echo_reactions;
create trigger trg_echo_reaction_count
  after insert or delete on public.echo_reactions
  for each row execute function public.adjust_echo_reaction_count();

create or replace function public.adjust_comment_reaction_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text;
begin
  v_col := case
    when coalesce(new.reaction, old.reaction) = 'mind_blown'   then 'mind_blown_count'
    when coalesce(new.reaction, old.reaction) = 'taking_notes' then 'taking_notes_count'
    when coalesce(new.reaction, old.reaction) = 'agree'        then 'agree_count'
    when coalesce(new.reaction, old.reaction) = 'disagree'     then 'disagree_count'
    else null end;
  if v_col is null then return null; end if;
  if tg_op = 'INSERT' then
    execute format('update public.echo_comments set %I = coalesce(%I,0) + 1 where id = $1', v_col, v_col) using new.comment_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.echo_comments set %I = greatest(coalesce(%I,0) - 1, 0) where id = $1', v_col, v_col) using old.comment_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_comment_reaction_count on public.comment_reactions;
create trigger trg_comment_reaction_count
  after insert or delete on public.comment_reactions
  for each row execute function public.adjust_comment_reaction_count();

-- Daily Question
create table if not exists public.daily_questions (
  id          uuid primary key default gen_random_uuid(),
  active_date date not null unique,
  question    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.daily_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  answer      text not null,
  echo_id     uuid references public.public_echoes (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (question_id, user_id)
);
create index if not exists idx_daily_answers_question on public.daily_answers (question_id);
create index if not exists idx_daily_answers_user on public.daily_answers (user_id);

alter table public.daily_questions enable row level security;
alter table public.daily_answers enable row level security;

drop policy if exists "daily_questions select all" on public.daily_questions;
create policy "daily_questions select all" on public.daily_questions for select using (true);
drop policy if exists "daily_answers select all" on public.daily_answers;
create policy "daily_answers select all" on public.daily_answers for select using (true);
drop policy if exists "daily_answers insert own" on public.daily_answers;
create policy "daily_answers insert own" on public.daily_answers
  for insert with check (auth.uid() = user_id);
drop policy if exists "daily_answers delete own" on public.daily_answers;
create policy "daily_answers delete own" on public.daily_answers
  for delete using (auth.uid() = user_id);

-- Salons (topic communities)
create table if not exists public.salons (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,
  cover_color   text default '#7C3AED',
  topic_tags    text[] not null default '{}',
  owner_id      uuid not null references auth.users (id) on delete cascade,
  member_count  integer not null default 0,
  echo_count    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_salons_owner on public.salons (owner_id);

create table if not exists public.salon_members (
  salon_id   uuid not null references public.salons (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'mod', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (salon_id, user_id)
);
create index if not exists idx_salon_members_user on public.salon_members (user_id);

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'public_echoes_salon_id_fkey'
      and table_name = 'public_echoes'
  ) then
    alter table public.public_echoes
      add constraint public_echoes_salon_id_fkey
      foreign key (salon_id) references public.salons (id) on delete set null;
  end if;
end $$;

alter table public.salons enable row level security;
alter table public.salon_members enable row level security;

drop policy if exists "salons select all" on public.salons;
create policy "salons select all" on public.salons for select using (true);
drop policy if exists "salons insert owner" on public.salons;
create policy "salons insert owner" on public.salons for insert with check (auth.uid() = owner_id);
drop policy if exists "salons update owner" on public.salons;
create policy "salons update owner" on public.salons for update using (auth.uid() = owner_id);
drop policy if exists "salons delete owner" on public.salons;
create policy "salons delete owner" on public.salons for delete using (auth.uid() = owner_id);

drop policy if exists "salon_members select all" on public.salon_members;
create policy "salon_members select all" on public.salon_members for select using (true);
drop policy if exists "salon_members insert self" on public.salon_members;
create policy "salon_members insert self" on public.salon_members for insert with check (auth.uid() = user_id);
drop policy if exists "salon_members delete self" on public.salon_members;
create policy "salon_members delete self" on public.salon_members for delete using (auth.uid() = user_id);

create or replace function public.add_salon_owner_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.salon_members (salon_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_add_salon_owner on public.salons;
create trigger trg_add_salon_owner
  after insert on public.salons
  for each row execute function public.add_salon_owner_as_member();

create or replace function public.adjust_salon_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.salons set member_count = member_count + 1 where id = new.salon_id;
  elsif tg_op = 'DELETE' then
    update public.salons set member_count = greatest(member_count - 1, 0) where id = old.salon_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_salon_member_count on public.salon_members;
create trigger trg_salon_member_count
  after insert or delete on public.salon_members
  for each row execute function public.adjust_salon_member_count();

create or replace function public.adjust_salon_echo_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.salon_id is not null then
    update public.salons set echo_count = echo_count + 1 where id = new.salon_id;
  elsif tg_op = 'DELETE' and old.salon_id is not null then
    update public.salons set echo_count = greatest(echo_count - 1, 0) where id = old.salon_id;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.salon_id::text, '') <> coalesce(new.salon_id::text, '') then
      if old.salon_id is not null then
        update public.salons set echo_count = greatest(echo_count - 1, 0) where id = old.salon_id;
      end if;
      if new.salon_id is not null then
        update public.salons set echo_count = echo_count + 1 where id = new.salon_id;
      end if;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_salon_echo_count on public.public_echoes;
create trigger trg_salon_echo_count
  after insert or update or delete on public.public_echoes
  for each row execute function public.adjust_salon_echo_count();

-- Office Hours
create table if not exists public.office_hours (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references auth.users (id) on delete cascade,
  topic       text not null,
  description text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  rsvp_count  integer not null default 0,
  status      text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_office_hours_host on public.office_hours (host_id);
create index if not exists idx_office_hours_starts on public.office_hours (starts_at);

create table if not exists public.office_hour_rsvps (
  office_hour_id uuid not null references public.office_hours (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (office_hour_id, user_id)
);

create table if not exists public.office_hour_questions (
  id              uuid primary key default gen_random_uuid(),
  office_hour_id  uuid not null references public.office_hours (id) on delete cascade,
  asker_id        uuid not null references auth.users (id) on delete cascade,
  question        text not null,
  answer          text,
  upvote_count    integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_oh_questions_oh on public.office_hour_questions (office_hour_id);
create index if not exists idx_oh_questions_upvotes on public.office_hour_questions (upvote_count desc);

create table if not exists public.office_hour_question_upvotes (
  question_id uuid not null references public.office_hour_questions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

alter table public.office_hours enable row level security;
alter table public.office_hour_rsvps enable row level security;
alter table public.office_hour_questions enable row level security;
alter table public.office_hour_question_upvotes enable row level security;

drop policy if exists "office_hours select all" on public.office_hours;
create policy "office_hours select all" on public.office_hours for select using (true);
drop policy if exists "office_hours insert host" on public.office_hours;
create policy "office_hours insert host" on public.office_hours for insert with check (auth.uid() = host_id);
drop policy if exists "office_hours update host" on public.office_hours;
create policy "office_hours update host" on public.office_hours for update using (auth.uid() = host_id);
drop policy if exists "office_hours delete host" on public.office_hours;
create policy "office_hours delete host" on public.office_hours for delete using (auth.uid() = host_id);

drop policy if exists "oh_rsvps select all" on public.office_hour_rsvps;
create policy "oh_rsvps select all" on public.office_hour_rsvps for select using (true);
drop policy if exists "oh_rsvps insert own" on public.office_hour_rsvps;
create policy "oh_rsvps insert own" on public.office_hour_rsvps for insert with check (auth.uid() = user_id);
drop policy if exists "oh_rsvps delete own" on public.office_hour_rsvps;
create policy "oh_rsvps delete own" on public.office_hour_rsvps for delete using (auth.uid() = user_id);

drop policy if exists "oh_questions select all" on public.office_hour_questions;
create policy "oh_questions select all" on public.office_hour_questions for select using (true);
drop policy if exists "oh_questions insert own" on public.office_hour_questions;
create policy "oh_questions insert own" on public.office_hour_questions for insert with check (auth.uid() = asker_id);
drop policy if exists "oh_questions update host_or_asker" on public.office_hour_questions;
create policy "oh_questions update host_or_asker" on public.office_hour_questions
  for update using (
    auth.uid() = asker_id
    or exists (select 1 from public.office_hours oh where oh.id = office_hour_id and oh.host_id = auth.uid())
  );

drop policy if exists "oh_upvotes select all" on public.office_hour_question_upvotes;
create policy "oh_upvotes select all" on public.office_hour_question_upvotes for select using (true);
drop policy if exists "oh_upvotes insert own" on public.office_hour_question_upvotes;
create policy "oh_upvotes insert own" on public.office_hour_question_upvotes for insert with check (auth.uid() = user_id);
drop policy if exists "oh_upvotes delete own" on public.office_hour_question_upvotes;
create policy "oh_upvotes delete own" on public.office_hour_question_upvotes for delete using (auth.uid() = user_id);

create or replace function public.adjust_oh_rsvp_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.office_hours set rsvp_count = rsvp_count + 1 where id = new.office_hour_id;
  elsif tg_op = 'DELETE' then
    update public.office_hours set rsvp_count = greatest(rsvp_count - 1, 0) where id = old.office_hour_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_oh_rsvp_count on public.office_hour_rsvps;
create trigger trg_oh_rsvp_count
  after insert or delete on public.office_hour_rsvps
  for each row execute function public.adjust_oh_rsvp_count();

create or replace function public.adjust_oh_question_upvote_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.office_hour_questions set upvote_count = upvote_count + 1 where id = new.question_id;
  elsif tg_op = 'DELETE' then
    update public.office_hour_questions set upvote_count = greatest(upvote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_oh_question_upvote_count on public.office_hour_question_upvotes;
create trigger trg_oh_question_upvote_count
  after insert or delete on public.office_hour_question_upvotes
  for each row execute function public.adjust_oh_question_upvote_count();

-- Badges & user_badges
create table if not exists public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null,
  icon        text not null,
  tier        text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'special')),
  criteria    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id    uuid not null references auth.users (id) on delete cascade,
  badge_id   uuid not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists idx_user_badges_user on public.user_badges (user_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badges select all" on public.badges;
create policy "badges select all" on public.badges for select using (true);
drop policy if exists "user_badges select all" on public.user_badges;
create policy "user_badges select all" on public.user_badges for select using (true);

insert into public.badges (slug, name, description, icon, tier, criteria) values
  ('first_echo',      'First Echo',       'You posted your first echo. Welcome to the conversation.',           '1',   'bronze', '{"echoes":1}'),
  ('streak_7',        'On a Roll',         'Seven days of consecutive echoes. The mind is warming up.',          '7',   'silver', '{"streak":7}'),
  ('streak_30',       'Thirty-Day Streak', 'Thirty-day streak. You think out loud consistently.',                 '30',  'gold',   '{"streak":30}'),
  ('verified_thinker','Verified Thinker',  'Reached 100 mind-blown reactions across your echoes.',               '100', 'gold',   '{"mind_blown":100}'),
  ('curator',         'Curator',           'You answered 30 Daily Questions.',                                   'DQ',  'silver', '{"daily_answers":30}'),
  ('host',            'Host',              'You ran your first Office Hours session.',                           'OH',  'silver', '{"office_hours_hosted":1}'),
  ('salon_keeper',    'Salon Keeper',      'You started a Salon that reached 25 members.',                       'S',   'gold',   '{"salon_members":25}'),
  ('wrap_2026',       'Year in Echo 2026', 'Completed your 2026 Year in Echo recap.',                           '26',  'special','{"year":2026}')
on conflict (slug) do nothing;

-- Year in Echo
create table if not exists public.year_wraps (
  user_id              uuid not null references auth.users (id) on delete cascade,
  year                 integer not null,
  total_echoes         integer not null default 0,
  total_likes_received integer not null default 0,
  total_reactions      integer not null default 0,
  top_topics           text[] not null default '{}',
  top_echo_id          uuid references public.public_echoes (id) on delete set null,
  longest_streak       integer not null default 0,
  computed_at          timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.year_wraps enable row level security;
drop policy if exists "year_wraps select own" on public.year_wraps;
create policy "year_wraps select own" on public.year_wraps for select using (auth.uid() = user_id);

-- Quests
create table if not exists public.quests (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text not null,
  goal_type       text not null check (goal_type in ('post_count', 'reaction_count', 'streak_days', 'mentions_count', 'daily_answers')),
  goal_value      integer not null,
  reward_xp       integer not null default 100,
  reward_badge_id uuid references public.badges (id) on delete set null,
  recurrence      text not null default 'daily' check (recurrence in ('daily', 'weekly', 'monthly', 'once')),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.user_quests (
  user_id      uuid not null references auth.users (id) on delete cascade,
  quest_id     uuid not null references public.quests (id) on delete cascade,
  started_at   timestamptz not null default now(),
  progress     integer not null default 0,
  completed_at timestamptz,
  primary key (user_id, quest_id, started_at)
);
create index if not exists idx_user_quests_user on public.user_quests (user_id);

alter table public.quests enable row level security;
alter table public.user_quests enable row level security;

drop policy if exists "quests select active" on public.quests;
create policy "quests select active" on public.quests for select using (true);

drop policy if exists "user_quests select own" on public.user_quests;
create policy "user_quests select own" on public.user_quests for select using (auth.uid() = user_id);
drop policy if exists "user_quests insert own" on public.user_quests;
create policy "user_quests insert own" on public.user_quests for insert with check (auth.uid() = user_id);
drop policy if exists "user_quests update own" on public.user_quests;
create policy "user_quests update own" on public.user_quests for update using (auth.uid() = user_id);

insert into public.quests (slug, title, description, goal_type, goal_value, reward_xp, recurrence) values
  ('daily_post',     'Drop one echo',                    'Post one echo today to keep the wheel turning.',     'post_count',     1,  50, 'daily'),
  ('daily_react',    'Spark three reactions',            'React to three echoes today.',                       'reaction_count', 3,  30, 'daily'),
  ('daily_answer',   'Answer the Daily Question',        'Add your take to today''s Daily Question.',          'daily_answers',  1,  75, 'daily'),
  ('weekly_streak',  'Hit a 7-day streak',               'Post an echo every day this week.',                  'streak_days',    7, 250, 'weekly'),
  ('weekly_mention', 'Tag three thinkers',               'Use @-mentions to highlight three different people.','mentions_count', 3,  60, 'weekly')
on conflict (slug) do nothing;

create or replace view public.echo_reaction_summary as
select
  e.id as echo_id,
  e.mind_blown_count,
  e.taking_notes_count,
  e.agree_count,
  e.disagree_count,
  (coalesce(e.mind_blown_count, 0)
   + coalesce(e.taking_notes_count, 0)
   + coalesce(e.agree_count, 0)
   + coalesce(e.disagree_count, 0)) as total_reactions
from public.public_echoes e;
