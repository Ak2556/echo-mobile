-- Daily-answer reactions — Phase 2 of the Daily Question ritual.
--
-- Lets people react to each other's answers, turning the solo journaling ritual
-- into a social loop: a reaction inserts a notifications row for the answer's
-- author, which chains into the existing trg_notifications_push_fanout →
-- push-fanout Edge Function (so the author gets a push, pulling them back).
--
-- The tap handler in app/_layout.tsx routes kind='daily_react' → /daily-question.

create table if not exists public.daily_answer_reactions (
  id         uuid primary key default gen_random_uuid(),
  answer_id  uuid not null references public.daily_answers (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null check (length(emoji) <= 10),
  created_at timestamptz not null default now(),
  unique (answer_id, user_id, emoji)
);
create index if not exists idx_daily_answer_reactions_answer
  on public.daily_answer_reactions (answer_id);

alter table public.daily_answer_reactions enable row level security;

-- Answers are world-readable (daily_answers "select all"), so reactions are too.
drop policy if exists "daily_answer_reactions select all" on public.daily_answer_reactions;
create policy "daily_answer_reactions select all"
  on public.daily_answer_reactions for select using (true);

drop policy if exists "daily_answer_reactions insert own" on public.daily_answer_reactions;
create policy "daily_answer_reactions insert own"
  on public.daily_answer_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "daily_answer_reactions delete own" on public.daily_answer_reactions;
create policy "daily_answer_reactions delete own"
  on public.daily_answer_reactions for delete using (auth.uid() = user_id);

-- Allow the daily_react notification type. Re-state the full CHECK (the DSA
-- migration last redefined it) so this stays the single source of truth.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'report_resolved', 'content_removed',
    'daily_react'
  ));

-- Notify the answer's author when someone else reacts. Best-effort: a failure
-- here must never block the reaction insert.
create or replace function public.fn_daily_reaction_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author  uuid;
  v_snippet text;
begin
  select user_id, left(answer, 60)
    into v_author, v_snippet
    from public.daily_answers
   where id = new.answer_id;

  -- No self-notify, and nothing to do if the answer vanished.
  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_author, 'daily_react', new.user_id, new.answer_id, 'daily_answer',
          new.emoji || '  ' || v_snippet);

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_daily_reaction_notify on public.daily_answer_reactions;
create trigger trg_daily_reaction_notify
  after insert on public.daily_answer_reactions
  for each row execute function public.fn_daily_reaction_notify();
