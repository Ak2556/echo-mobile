-- Let 'friend_answer' actually be inserted.
--
-- 20260828080000 added fn_friend_daily_answer_notify, which inserts a
-- notification of type 'friend_answer'. notifications_type_check did not list
-- that value, so every insert violated the constraint — and because the trigger
-- ends in `exception when others then return new` (so a notification failure
-- can never stop someone answering the question), the violation was swallowed
-- and the feature was silently inert.
--
-- This is the same drift that keeps recurring here: half a feature ships in one
-- migration and the enum guarding it is updated in none. Worth stating plainly
-- so the next person adding a notification type checks this constraint first.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'like', 'comment', 'follow', 'repost', 'mention', 'dm', 'reaction',
    'bookmark', 'quote', 'report_resolved', 'content_removed',
    'appeal_resolved', 'daily_react', 'personal_nudge', 'friend_post',
    'social_task_update', 'friend_answer'
  ]));
