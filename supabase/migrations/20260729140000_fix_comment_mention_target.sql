-- Comment-mention notifications stored target_id = comment_id (target_kind
-- 'comment'), but both the push tap handler and the in-app notifications list
-- route every 'mention' to /thread/[target_id], which expects an ECHO id — so
-- tapping a mention made inside a comment landed on a broken/empty thread.
--
-- The trigger already looks up the parent echo (v_echo); point target_id at it
-- and mark target_kind 'echo' so it routes to the right thread, matching how
-- echo-mentions already behave.

create or replace function public.notify_on_comment_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_echo uuid;
begin
  select author_id, echo_id into v_actor, v_echo from public.echo_comments where id = new.comment_id;
  if v_actor is not null and v_actor <> new.mentioned_user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (new.mentioned_user_id, 'mention', v_actor, 'echo', v_echo)
    on conflict do nothing;
  end if;
  return new;
end $$;
