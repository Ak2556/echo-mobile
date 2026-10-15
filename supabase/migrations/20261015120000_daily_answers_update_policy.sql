-- Editing a daily answer has never worked.
--
-- daily_answers got insert, select and delete policies in 20260521120000 and never an update
-- policy, so row-level security refuses every UPDATE. The app saves with
--   upsert({ question_id, user_id, answer }, { onConflict: 'question_id,user_id' })
-- which is an INSERT the first time and an UPDATE on conflict: submitting a second time (the
-- "Your answer (you can edit anytime)" and "Update" buttons) failed with "Could not submit".
--
-- Own rows only, authenticated only. The BEFORE UPDATE trigger keeps an edit an edit: the
-- answer text may change, but the row cannot be moved to another question or another user
-- (which would also dodge the one-answer-per-question key and the hourly insert limit).

create policy "daily_answers update own" on public.daily_answers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.daily_answers_keep_keys()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.question_id is distinct from old.question_id or new.user_id is distinct from old.user_id then
    raise exception 'daily_answers: question_id and user_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists daily_answers_keep_keys on public.daily_answers;
create trigger daily_answers_keep_keys
  before update on public.daily_answers
  for each row execute function public.daily_answers_keep_keys();
