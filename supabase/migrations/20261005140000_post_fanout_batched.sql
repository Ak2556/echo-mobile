-- Posting must not cost O(followers) inside the author's transaction.
--
-- Measured on production (rolled-back probe): each follower notified is 0.54 ms
-- of the post insert, because fn_friend_post_notify inserted one notifications
-- row per follower and each row's trigger enqueued a push job AND fired an HTTP
-- call to the worker (jobs_kick). At 10,000 followers that is about 5 s added to
-- posting and 10,000 worker invocations at once.
--
-- Now: the post trigger enqueues ONE job. The worker expands it in keyset
-- batches (fanout_friend_post_batch), each batch a single INSERT ... SELECT and
-- a single worker kick. Posting is constant time; delivery is steady background
-- work. Every statement here is idempotent so a retried job cannot double-notify.
begin;

select pgmq.create('post_fanout');

-- 1. Keyset batching reads "followers of X after cursor, in order". The primary
--    key is (follower_id, following_id), the wrong way round for that, and
--    follows_following_idx (following_id) alone would sort each batch. The
--    composite serves every batch in O(log n + batch) and makes the single-column
--    index redundant (it is a prefix).
create index if not exists follows_following_follower_idx
  on public.follows (following_id, follower_id);
drop index if exists public.follows_following_idx;

-- 2. One friend_post per (recipient, echo). Makes a re-run batch a no-op; the
--    table held 271 rows and 271 distinct pairs when this was written.
create unique index if not exists notifications_friend_post_once
  on public.notifications (user_id, target_id)
  where type = 'friend_post';

-- 3. The per-row push trigger kicks the worker once per notification. During a
--    batch fan-out that is the herd this change removes, so inside a batch it
--    queues the job without the kick and the batch kicks once at the end.
create or replace function public.fanout_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('echo.bulk_fanout', true), '') = 'on' then
    perform pgmq.send('push', jsonb_build_object('notification_id', new.id));
  else
    perform public.jobs_enqueue('push', jsonb_build_object('notification_id', new.id));
  end if;
  return new;
end;
$$;

-- 4. The post trigger: constant work. A failure to queue must never block the
--    post itself (the same rule the other notification triggers follow).
create or replace function public.fn_friend_post_notify()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
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

-- 5. One batch. Returns the last follower id processed when the batch was full
--    (there may be more), or null when this was the last batch. Worker-only: it
--    writes notifications for other people.
create or replace function public.fanout_friend_post_batch(
  p_echo_id uuid,
  p_author_id uuid,
  p_preview text,
  p_after uuid default null,
  p_limit integer default 500
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_last uuid;
begin
  -- The author and preview arrive in the job (the post trigger has them), so this
  -- SECURITY DEFINER function reads no echo content: it only turns a follower
  -- list into notification rows.
  perform set_config('echo.bulk_fanout', 'on', true);

  with batch as (
    select f.follower_id
      from public.follows f
     where f.following_id = p_author_id
       and (p_after is null or f.follower_id > p_after)
     order by f.follower_id
     limit greatest(p_limit, 1)
  ), ins as (
    insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
    select b.follower_id, 'friend_post', p_author_id, p_echo_id, 'echo', p_preview
      from batch b
    on conflict do nothing
    returning 1
  )
  select count(*), (array_agg(b.follower_id order by b.follower_id desc))[1]
    into v_n, v_last
    from batch b;

  perform set_config('echo.bulk_fanout', 'off', true);

  if v_n > 0 then
    perform public.jobs_kick('push');
  end if;
  return case when v_n >= greatest(p_limit, 1) then v_last else null end;
end;
$$;

revoke all on function public.fanout_friend_post_batch(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.fanout_friend_post_batch(uuid, uuid, text, uuid, integer) to service_role;
grant execute on function public.jobs_enqueue(text, jsonb, integer) to service_role;

commit;
