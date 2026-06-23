-- App-wide rate limits for direct Supabase writes.
--
-- This protects the write surfaces that clients can call directly through
-- PostgREST. The counters live in one table keyed by (user, action), and
-- triggers enforce both burst and daily windows where needed.

create table if not exists public.app_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  request_count integer not null default 0,
  limit_count integer not null,
  window_seconds integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, action)
);

create index if not exists app_rate_limits_updated_idx
  on public.app_rate_limits(updated_at desc);

alter table public.app_rate_limits enable row level security;

drop policy if exists app_rate_limits_select_own on public.app_rate_limits;
create policy app_rate_limits_select_own
  on public.app_rate_limits for select
  using (auth.uid() = user_id);

-- No user write policies. This function and trusted Edge Functions write via
-- SECURITY DEFINER/service role only.

create or replace function public.check_app_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer,
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_user_id is null then
    raise exception 'rate_limit_unauthenticated'
      using errcode = 'P0001';
  end if;

  if auth.uid() is not null and p_user_id <> auth.uid() then
    raise exception 'rate_limit_user_mismatch'
      using errcode = 'P0001';
  end if;

  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'rate_limit_action_required'
      using errcode = 'P0001';
  end if;

  if p_limit < 0 then
    return;
  end if;

  if p_limit = 0 or p_window_seconds <= 0 then
    raise exception 'rate_limit_exceeded:%:%:%', p_action, p_limit, 0
      using errcode = 'P0001';
  end if;

  select window_start, request_count
    into v_window_start, v_count
    from public.app_rate_limits
   where user_id = p_user_id
     and action = p_action
   for update;

  if not found or v_now >= v_window_start + make_interval(secs => p_window_seconds) then
    v_window_start := v_now;
    v_count := 0;
  end if;

  if v_count >= p_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
    raise exception 'rate_limit_exceeded:%:%:%', p_action, p_limit, v_retry_after
      using errcode = 'P0001';
  end if;

  insert into public.app_rate_limits as rl (
    user_id,
    action,
    window_start,
    request_count,
    limit_count,
    window_seconds,
    updated_at
  )
  values (
    p_user_id,
    p_action,
    v_window_start,
    v_count + 1,
    p_limit,
    p_window_seconds,
    v_now
  )
  on conflict (user_id, action) do update
    set window_start = excluded.window_start,
        request_count = excluded.request_count,
        limit_count = excluded.limit_count,
        window_seconds = excluded.window_seconds,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.check_app_rate_limit(text, integer, integer, uuid) from public;
grant execute on function public.check_app_rate_limit(text, integer, integer, uuid) to authenticated;
grant execute on function public.check_app_rate_limit(text, integer, integer, uuid) to service_role;

create or replace function public.enforce_insert_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := tg_argv[0];
  v_limit integer := tg_argv[1]::integer;
  v_window_seconds integer := tg_argv[2]::integer;
  v_user_ref text := tg_argv[3];
  v_user_id uuid;
begin
  if v_user_ref = 'auth.uid' then
    v_user_id := auth.uid();
  else
    v_user_id := nullif(to_jsonb(new)->>v_user_ref, '')::uuid;
  end if;

  perform public.check_app_rate_limit(v_action, v_limit, v_window_seconds, v_user_id);
  return new;
end;
$$;

revoke all on function public.enforce_insert_rate_limit() from public;

create or replace function public.enforce_profile_update_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id and (
    old.username is distinct from new.username
    or old.display_name is distinct from new.display_name
    or old.bio is distinct from new.bio
    or old.avatar_color is distinct from new.avatar_color
    or old.avatar_url is distinct from new.avatar_url
    or old.mood is distinct from new.mood
    or old.mood_expires_at is distinct from new.mood_expires_at
    or old.pronouns is distinct from new.pronouns
    or old.pinned_echo_id is distinct from new.pinned_echo_id
  ) then
    perform public.check_app_rate_limit('profile_update_hour', 20, 3600, new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_profile_update_rate_limit() from public;

-- Publishing and profile
drop trigger if exists rate_limit_public_echoes_hour on public.public_echoes;
create trigger rate_limit_public_echoes_hour
  before insert on public.public_echoes
  for each row execute function public.enforce_insert_rate_limit('publish_echo_hour', '12', '3600', 'author_id');

drop trigger if exists rate_limit_public_echoes_day on public.public_echoes;
create trigger rate_limit_public_echoes_day
  before insert on public.public_echoes
  for each row execute function public.enforce_insert_rate_limit('publish_echo_day', '40', '86400', 'author_id');

drop trigger if exists rate_limit_profiles_update_hour on public.profiles;
create trigger rate_limit_profiles_update_hour
  before update on public.profiles
  for each row execute function public.enforce_profile_update_rate_limit();

-- Comments and reports
drop trigger if exists rate_limit_echo_comments_minute on public.echo_comments;
create trigger rate_limit_echo_comments_minute
  before insert on public.echo_comments
  for each row execute function public.enforce_insert_rate_limit('comment_minute', '8', '60', 'author_id');

drop trigger if exists rate_limit_echo_comments_day on public.echo_comments;
create trigger rate_limit_echo_comments_day
  before insert on public.echo_comments
  for each row execute function public.enforce_insert_rate_limit('comment_day', '200', '86400', 'author_id');

drop trigger if exists rate_limit_reports_day on public.reports;
create trigger rate_limit_reports_day
  before insert on public.reports
  for each row execute function public.enforce_insert_rate_limit('report_day', '30', '86400', 'reporter_id');

drop trigger if exists rate_limit_salons_day on public.salons;
create trigger rate_limit_salons_day
  before insert on public.salons
  for each row execute function public.enforce_insert_rate_limit('salon_create_day', '5', '86400', 'owner_id');

drop trigger if exists rate_limit_office_hours_day on public.office_hours;
create trigger rate_limit_office_hours_day
  before insert on public.office_hours
  for each row execute function public.enforce_insert_rate_limit('office_hour_create_day', '10', '86400', 'host_id');

-- Social actions
drop trigger if exists rate_limit_echo_likes_minute on public.echo_likes;
create trigger rate_limit_echo_likes_minute
  before insert on public.echo_likes
  for each row execute function public.enforce_insert_rate_limit('echo_like_minute', '60', '60', 'user_id');

drop trigger if exists rate_limit_echo_bookmarks_minute on public.echo_bookmarks;
create trigger rate_limit_echo_bookmarks_minute
  before insert on public.echo_bookmarks
  for each row execute function public.enforce_insert_rate_limit('echo_bookmark_minute', '40', '60', 'user_id');

drop trigger if exists rate_limit_echo_reposts_minute on public.echo_reposts;
create trigger rate_limit_echo_reposts_minute
  before insert on public.echo_reposts
  for each row execute function public.enforce_insert_rate_limit('echo_repost_minute', '20', '60', 'user_id');

drop trigger if exists rate_limit_echo_reactions_minute on public.echo_reactions;
create trigger rate_limit_echo_reactions_minute
  before insert on public.echo_reactions
  for each row execute function public.enforce_insert_rate_limit('echo_reaction_minute', '80', '60', 'user_id');

drop trigger if exists rate_limit_comment_likes_minute on public.comment_likes;
create trigger rate_limit_comment_likes_minute
  before insert on public.comment_likes
  for each row execute function public.enforce_insert_rate_limit('comment_like_minute', '60', '60', 'user_id');

drop trigger if exists rate_limit_follows_hour on public.follows;
create trigger rate_limit_follows_hour
  before insert on public.follows
  for each row execute function public.enforce_insert_rate_limit('follow_hour', '60', '3600', 'follower_id');

drop trigger if exists rate_limit_follows_day on public.follows;
create trigger rate_limit_follows_day
  before insert on public.follows
  for each row execute function public.enforce_insert_rate_limit('follow_day', '200', '86400', 'follower_id');

-- Direct messages
drop trigger if exists rate_limit_dm_conversations_day on public.dm_conversations;
create trigger rate_limit_dm_conversations_day
  after insert on public.dm_conversations
  for each row execute function public.enforce_insert_rate_limit('dm_conversation_day', '30', '86400', 'auth.uid');

drop trigger if exists rate_limit_direct_messages_minute on public.direct_messages;
create trigger rate_limit_direct_messages_minute
  before insert on public.direct_messages
  for each row execute function public.enforce_insert_rate_limit('dm_message_minute', '30', '60', 'sender_id');

drop trigger if exists rate_limit_direct_messages_day on public.direct_messages;
create trigger rate_limit_direct_messages_day
  before insert on public.direct_messages
  for each row execute function public.enforce_insert_rate_limit('dm_message_day', '500', '86400', 'sender_id');

drop trigger if exists rate_limit_message_reactions_minute on public.message_reactions;
create trigger rate_limit_message_reactions_minute
  before insert on public.message_reactions
  for each row execute function public.enforce_insert_rate_limit('message_reaction_minute', '80', '60', 'user_id');

-- Daily/social community surfaces
drop trigger if exists rate_limit_daily_answers_hour on public.daily_answers;
create trigger rate_limit_daily_answers_hour
  before insert on public.daily_answers
  for each row execute function public.enforce_insert_rate_limit('daily_answer_hour', '5', '3600', 'user_id');

drop trigger if exists rate_limit_salon_members_hour on public.salon_members;
create trigger rate_limit_salon_members_hour
  before insert on public.salon_members
  for each row execute function public.enforce_insert_rate_limit('salon_join_hour', '40', '3600', 'user_id');

drop trigger if exists rate_limit_office_hour_rsvps_hour on public.office_hour_rsvps;
create trigger rate_limit_office_hour_rsvps_hour
  before insert on public.office_hour_rsvps
  for each row execute function public.enforce_insert_rate_limit('office_hour_rsvp_hour', '40', '3600', 'user_id');

drop trigger if exists rate_limit_office_hour_questions_hour on public.office_hour_questions;
create trigger rate_limit_office_hour_questions_hour
  before insert on public.office_hour_questions
  for each row execute function public.enforce_insert_rate_limit('office_hour_question_hour', '12', '3600', 'asker_id');

drop trigger if exists rate_limit_office_hour_question_upvotes_minute on public.office_hour_question_upvotes;
create trigger rate_limit_office_hour_question_upvotes_minute
  before insert on public.office_hour_question_upvotes
  for each row execute function public.enforce_insert_rate_limit('office_hour_question_upvote_minute', '60', '60', 'user_id');

-- View tracking is noisy, but still needs an anti-abuse cap.
drop trigger if exists rate_limit_echo_views_minute on public.echo_views;
create trigger rate_limit_echo_views_minute
  before insert on public.echo_views
  for each row execute function public.enforce_insert_rate_limit('echo_view_minute', '240', '60', 'user_id');
