-- 1. Update the type check constraint to allow new types
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'like', 'comment', 'follow', 'repost', 'mention', 'dm',
    'reaction', 'bookmark', 'quote',
    'report_resolved', 'content_removed', 'appeal_resolved',
    'daily_react', 'personal_nudge',
    'friend_post', 'social_task_update'
  ));

-- 2. Trigger: Notify mutual friends when a new public echo is posted
create or replace function public.fn_friend_post_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  select f1.follower_id, 'friend_post', new.author_id, new.id, 'echo', left(coalesce(new.prompt, new.title, ''), 140)
  from public.follows f1
  join public.follows f2 on f1.follower_id = f2.following_id and f1.following_id = f2.follower_id
  where f1.following_id = new.author_id;
  
  return new;
end;
$$;

drop trigger if exists trg_friend_post_notify on public.public_echoes;
create trigger trg_friend_post_notify
  after insert on public.public_echoes
  for each row execute function public.fn_friend_post_notify();

-- 3. Trigger: Notify mutual friends when a task is marked as done
create or replace function public.fn_social_task_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done = true and (old is null or old.done = false) then
    insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
    select f1.follower_id, 'social_task_update', new.user_id, new.id, 'task', left(new.title, 140)
    from public.follows f1
    join public.follows f2 on f1.follower_id = f2.following_id and f1.following_id = f2.follower_id
    where f1.following_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_social_task_notify on public.task_item;
create trigger trg_social_task_notify
  after update on public.task_item
  for each row execute function public.fn_social_task_notify();
