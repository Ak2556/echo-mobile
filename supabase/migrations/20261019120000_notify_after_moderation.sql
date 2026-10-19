-- A post's text must not reach anyone's notifications before moderation has passed it.
--
-- Publishing is fail-closed: a post is inserted hidden (check_content = false) and only a passing
-- verdict makes it visible. But two AFTER INSERT triggers acted on the post at insert time:
--
--   trg_friend_post_notify  queued the follower fan-out, whose notifications (and pushes) carry the
--                           first 140 characters of the post;
--   trg_notify_echo_quote   told the author of a quoted post that they were quoted, with the same
--                           140-character preview.
--
-- So text the classifier had not yet judged, or went on to reject, was delivered to followers' lock
-- screens. The notification and the post then pointed at nothing (the post stays hidden), which was
-- the visible symptom; the delivery of the text itself was the defect.
--
-- Both now act when the post is APPROVED: on an insert that already carries check_content = true
-- (server-side writers only; a client insert is forced to false), or on the update that flips
-- check_content from false to true.
--
-- Edge cases, each deliberate:
--   * An edit hides a post again (guard_client_writes) and moderation re-approves it, so the
--     "approved" trigger fires again. friend_post is protected by notifications_friend_post_once, so
--     the repeat inserts nothing. A quote has no such index, so notify_on_echo_quote checks for an
--     existing notification itself.
--   * restore_on_dismissed_urgent_report or an overturned appeal can approve a post long after it was
--     published. Fanning out an old post would be noise, so fan-out is skipped after six hours, the
--     same age after which a push is dropped (MAX_PUSH_AGE_MS in the worker).
--   * hold_moderated_content is a BEFORE trigger on the same column, so the AFTER trigger below sees
--     the final value: a post that is held never counts as approved.
--   * Mentions are not touched: notify_on_echo_mention carries no preview, only a pointer.

create or replace function public.fn_friend_post_notify() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.check_content is not true then
    return new;
  end if;
  -- Approved long after it was published: do not announce an old post as new.
  if new.created_at < now() - interval '6 hours' then
    return new;
  end if;
  perform public.jobs_enqueue('post_fanout', jsonb_build_object(
    'echo_id', new.id,
    'author_id', new.author_id,
    'preview', left(coalesce(new.prompt, new.title, ''), 140)
  ));
  return new;
exception when others then
  raise warning 'fn_friend_post_notify: could not queue fan-out for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_on_echo_quote() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_author uuid;
begin
  if new.quoted_echo_id is null or new.check_content is not true then
    return new;
  end if;
  -- Re-approval after an edit fires this trigger again; tell the quoted author once.
  if exists (
    select 1 from public.notifications n where n.type = 'quote' and n.target_id = new.id
  ) then
    return new;
  end if;
  select author_id into v_author from public.public_echoes where id = new.quoted_echo_id;
  if v_author is null or v_author = new.author_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (v_author, 'quote', new.author_id, 'echo', new.id, left(new.prompt, 140));
  return new;
exception when others then
  return new;
end
$$;

drop trigger if exists trg_friend_post_notify on public.public_echoes;
drop trigger if exists trg_friend_post_notify_inserted on public.public_echoes;
drop trigger if exists trg_friend_post_notify_approved on public.public_echoes;
create trigger trg_friend_post_notify_inserted
  after insert on public.public_echoes
  for each row when (new.check_content is true)
  execute function public.fn_friend_post_notify();
create trigger trg_friend_post_notify_approved
  after update of check_content on public.public_echoes
  for each row when (old.check_content is distinct from true and new.check_content is true)
  execute function public.fn_friend_post_notify();

drop trigger if exists trg_notify_echo_quote on public.public_echoes;
drop trigger if exists trg_notify_echo_quote_inserted on public.public_echoes;
drop trigger if exists trg_notify_echo_quote_approved on public.public_echoes;
create trigger trg_notify_echo_quote_inserted
  after insert on public.public_echoes
  for each row when (new.check_content is true and new.quoted_echo_id is not null)
  execute function public.notify_on_echo_quote();
create trigger trg_notify_echo_quote_approved
  after update of check_content on public.public_echoes
  for each row when (old.check_content is distinct from true and new.check_content is true and new.quoted_echo_id is not null)
  execute function public.notify_on_echo_quote();
