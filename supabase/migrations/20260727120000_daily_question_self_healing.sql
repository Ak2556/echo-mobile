-- Daily questions must never run dry — the original seed
-- (20260525120000_daily_question_seed.sql) inserted a fixed 30 days and the
-- promised cron was never built, so it went empty after 2026-07-24.
--
-- This makes the ritual self-healing with NO external cron dependency:
--   1. A curated question bank (curators can keep adding rows).
--   2. ensure_daily_question(date): idempotently materializes the row for a
--      date, deterministically cycling the bank. Callable by the app so the
--      first open on any day fills that day — the DB heals itself on read.
--   3. A one-year backfill so it's already populated far ahead.

create table if not exists public.daily_question_bank (
  id          bigint generated always as identity primary key,
  question    text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.daily_question_bank enable row level security;

-- Bank is readable by anyone signed in; only service role writes (via migrations).
drop policy if exists daily_question_bank_read on public.daily_question_bank;
create policy daily_question_bank_read on public.daily_question_bank
  for select using (true);

-- Seed the bank (idempotent). A generous, evergreen set of prompts written to
-- draw an interesting answer from a stranger — open enough to invite a real
-- take, narrow enough that "great question" isn't a valid response.
insert into public.daily_question_bank (question, sort_order) values
  ('What''s a piece of advice you ignored that turned out to be right?', 1),
  ('What''s the most expensive belief you''ve changed your mind about?', 2),
  ('What''s something that took you embarrassingly long to learn?', 3),
  ('Which skill do you most envy in other people?', 4),
  ('What''s a hobby you''ll never tell your coworkers about?', 5),
  ('What''s the smallest decision that ended up reshaping your life?', 6),
  ('What''s a book or essay that lives rent-free in your head?', 7),
  ('What''s a compliment you got that you keep replaying?', 8),
  ('What did you believe deeply at 22 that you''d argue against today?', 9),
  ('What''s the kindest thing a stranger has done for you?', 10),
  ('What''s a controversial opinion you''d defend in a job interview?', 11),
  ('What''s the best money you''ve spent under $50?', 12),
  ('What''s a question you wish more people asked you?', 13),
  ('What''s an industry secret your friends would be shocked by?', 14),
  ('What habit changed your life that takes less than 10 minutes a day?', 15),
  ('What''s a song that always pulls you out of a bad mood?', 16),
  ('What''s a piece of fiction that taught you something real?', 17),
  ('What''s the most useful question you ask yourself?', 18),
  ('What did you outgrow in the last year?', 19),
  ('What''s an interview question you wish was asked more often?', 20),
  ('What''s a craft, sport, or art you''d start over at 80?', 21),
  ('What''s your most underrated personality trait?', 22),
  ('What''s a small ritual that anchors your week?', 23),
  ('What''s a piece of design — UI, object, signage — you love and never tire of?', 24),
  ('What''s the conversation you''d redo if you could?', 25),
  ('What''s a moment you knew you were no longer the same person?', 26),
  ('What''s a productivity rule you broke that made you more productive?', 27),
  ('What''s a "boring" thing you find unreasonably interesting?', 28),
  ('What''s the difference between who people think you are and who you are?', 29),
  ('What''s a future technology you''re unreasonably hopeful about?', 30),
  ('What''s a rule you were taught that you now think is wrong?', 31),
  ('What''s the last thing that genuinely surprised you?', 32),
  ('What would you do with a free, obligation-free day tomorrow?', 33),
  ('What''s a skill you learned that turned out to be useless — and one you almost skipped that saved you?', 34),
  ('What''s the most useful thing you own that cost almost nothing?', 35),
  ('What''s a compliment you''d love to receive but never do?', 36),
  ('What''s something you changed your mind about because of one conversation?', 37),
  ('What''s a place that felt like home the moment you arrived?', 38),
  ('What''s the best decision you made that looked reckless at the time?', 39),
  ('What''s a small kindness you saw someone do that stuck with you?', 40),
  ('What''s a topic you could give an unprepared 20-minute talk on?', 41),
  ('What''s a fear you outgrew, and what did it for you?', 42),
  ('What''s the most honest thing you can say about your work?', 43),
  ('What''s something people misunderstand about your job or field?', 44),
  ('What''s a habit you''re proud of that no one notices?', 45),
  ('What''s the best question a kid ever asked you?', 46),
  ('What''s a piece of advice you''d give your 18-year-old self in one sentence?', 47),
  ('What''s something you find beautiful that most people overlook?', 48),
  ('What''s a risk you''re glad you took?', 49),
  ('What''s a risk you didn''t take that you still think about?', 50),
  ('What''s the most interesting thing you learned this month?', 51),
  ('What''s a tradition you''d invent if you could make everyone follow it?', 52),
  ('What''s something you believed as a kid that you wish were true?', 53),
  ('What''s a word or phrase you love in another language?', 54),
  ('What''s the smallest thing that can ruin or make your whole day?', 55),
  ('What''s a problem you enjoy solving so much it doesn''t feel like work?', 56),
  ('What''s the best feedback you ever received?', 57),
  ('What''s something you do differently from almost everyone you know?', 58),
  ('What''s a moment you felt genuinely proud but didn''t tell anyone?', 59),
  ('What''s a possession you''d grab first if you had 60 seconds?', 60),
  ('What''s an opinion you''ve quietly reversed in the last five years?', 61),
  ('What''s a skill you think everyone should learn but almost no one does?', 62),
  ('What''s the most alive you''ve felt recently?', 63),
  ('What''s something you''re better at than you let on?', 64),
  ('What''s a decision you make on autopilot that you probably shouldn''t?', 65),
  ('What''s a story your family tells about you?', 66),
  ('What''s something worth being obsessive about?', 67),
  ('What''s a trade-off you''ve made peace with?', 68),
  ('What''s the last thing that made you laugh out loud, alone?', 69),
  ('What would you want to be remembered for by people who barely knew you?', 70)
on conflict (question) do nothing;

-- Materialize (or fetch) the daily question for a given date. Deterministic:
-- the same date always maps to the same bank entry, cycling the bank.
create or replace function public.ensure_daily_question(target date default current_date)
returns public.daily_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out   public.daily_questions;
  bank_size int;
  pick      text;
begin
  select * into row_out from public.daily_questions where active_date = target;
  if found then
    return row_out;
  end if;

  select count(*) into bank_size from public.daily_question_bank;
  if bank_size = 0 then
    return null;
  end if;

  select question into pick
    from public.daily_question_bank
   order by sort_order, id
   offset ((target - date '2026-01-01') % bank_size)
   limit 1;

  insert into public.daily_questions (active_date, question)
  values (target, pick)
  on conflict (active_date) do nothing;

  select * into row_out from public.daily_questions where active_date = target;
  return row_out;
end;
$$;

grant execute on function public.ensure_daily_question(date) to anon, authenticated;

-- Backfill the recent gap (through today) plus a full year ahead, so the
-- ritual is populated far in advance even before anyone calls the function.
do $$
declare d date;
begin
  for d in
    select generate_series(current_date - 3, current_date + 365, interval '1 day')::date
  loop
    perform public.ensure_daily_question(d);
  end loop;
end;
$$;
