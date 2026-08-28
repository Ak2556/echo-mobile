-- "Someone you know answered today's question."
--
-- The daily question is the ritual the whole retention model rests on, and the
-- one social signal it never emitted was the one that actually pulls people
-- back: a friend answered, go read it. Reactions to *your* answer already
-- notify (fn_daily_reaction_notify) and so do friends' echoes
-- (fn_friend_post_notify) — an answer went out silently.
--
-- Two deliberate differences from fn_friend_post_notify:
--
--   1. Mutual follows only. An answer to a personal question is not a
--      broadcast, and "friend" in the product's language means both people
--      chose each other. It also bounds the fan-out: a popular account posting
--      an echo already writes one row per follower, and doing that again daily
--      for every answer is the shape that turns into a write storm.
--   2. One notification per author per day. A user who edits and re-answers
--      should not ping their whole circle twice.

create or replace function public.fn_friend_daily_answer_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_snippet text;
begin
  -- Re-answering the same question must not re-notify. Anything already sent
  -- today for this author covers it.
  if exists (
    select 1 from public.notifications
    where actor_id = new.user_id
      and type = 'friend_answer'
      and created_at > date_trunc('day', now())
  ) then
    return new;
  end if;

  v_snippet := left(coalesce(new.answer, ''), 140);

  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  select f.follower_id, 'friend_answer', new.user_id, new.id, 'daily_answer', v_snippet
  from public.follows f
  where f.following_id = new.user_id
    -- mutual: they follow the author, and the author follows them back
    and exists (
      select 1 from public.follows back
      where back.follower_id = new.user_id
        and back.following_id = f.follower_id
    );

  return new;
exception when others then
  -- Never let a notification failure block someone answering the question.
  return new;
end;
$function$;

drop trigger if exists trg_friend_daily_answer_notify on public.daily_answers;
create trigger trg_friend_daily_answer_notify
  after insert on public.daily_answers
  for each row execute function public.fn_friend_daily_answer_notify();

-- Index supporting the once-per-day guard above.
create index if not exists idx_notifications_actor_type_created
  on public.notifications (actor_id, type, created_at desc);
