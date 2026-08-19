-- 20260819140000_follower_post_notifications.sql

-- Update the new public echo trigger to notify ALL followers, not just mutual friends.
create or replace function public.fn_friend_post_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  select f1.follower_id, 'friend_post', new.author_id, new.id, 'echo', left(coalesce(new.prompt, new.title, ''), 140)
  from public.follows f1
  where f1.following_id = new.author_id;
  
  return new;
end;
$$;
