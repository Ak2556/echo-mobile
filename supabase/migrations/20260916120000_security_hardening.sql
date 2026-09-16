-- Security hardening: close the client write paths, the anon read path, the
-- rate-limit reset, and the block / DM-privacy gaps found in the 2026-09-16
-- audit. Every item below was confirmed against production before this was
-- written.
--
-- Apply this BEFORE the project's HTTP APIs come back from the egress
-- restriction. While PostgREST answers 402, none of these paths can be reached.
-- As soon as it stops, all of them can. `supabase db push` connects to Postgres
-- directly, so it still works during the restriction.
--
-- The rule used throughout: a column the server owns is corrected, not
-- rejected, when a client writes it. The shipped client never writes these
-- columns, so honest traffic behaves exactly as before, and a forged request
-- quietly does nothing. Rejections (42501) are reserved for things a person
-- needs to be told about, such as messaging someone who blocked them.
--
-- Guarded here, and tested in lib/securityHardening.test.ts:
--   §1  visible_echoes ran as its owner (postgres, BYPASSRLS) with write grants
--       to anon and authenticated, so anyone with the anon key could UPDATE or
--       DELETE any public echo.
--   §2  Server-owned columns were client-writable: check_content (so
--       moderation could be skipped), counters, ranking inputs, hls_url
--       (unmoderated video) and co-author attribution (impersonation).
--       Also: ads that activate themselves without paying, and learners who
--       accept their own bookings to unlock "learners only" lectures.
--   §3  Edited echoes were never re-moderated.
--   §4  Anon could read every echo: moderated or not, private or not.
--       Daily answers ignored private accounts.
--   §5  Any signed-in user could reset any server-side rate limit, and could
--       trigger the moderation sweep, which spends AI quota.
--   §6  Blocking someone did not stop them messaging you, and "Who can DM me"
--       was not enforced by the server.
--   §7  Three feed RPCs took the viewer's identity from a parameter, which let
--       a caller infer another user's block and mute lists. Two had no upper
--       bound on page size.

begin;

-- ── §1 visible_echoes ────────────────────────────────────────────────────────
-- Feed RPCs read this view from inside SECURITY DEFINER functions owned by
-- postgres. With security_invoker they still bypass RLS (postgres has
-- BYPASSRLS), so their results don't change. A client reading the view
-- directly now gets public_echoes' own RLS as well.
alter view public.visible_echoes set (security_invoker = true);
-- 20260910120000 granted SELECT only, but Supabase's default privileges on the
-- public schema had already handed anon and authenticated everything else.
revoke insert, update, delete, truncate, references, trigger
  on public.visible_echoes from anon, authenticated;
comment on view public.visible_echoes is
  'public_echoes filtered by can_view_echo_author. Feed RPCs read this instead of the table so a definer function cannot leak private accounts. security_invoker since 20260916120000: inside definer functions the owner still bypasses RLS and the predicate gates; a direct client read gets public_echoes RLS as well. Read-only for client roles.';

-- ── §2 server-owned columns ──────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user has to be the caller's role.
-- Three kinds of statement pass through untouched:
--   * service_role requests (edge functions, the Razorpay webhook)
--   * SECURITY DEFINER functions, where current_user is their owner
--   * statements issued by other triggers (pg_trigger_depth() > 1), such as
--     the counter-maintenance triggers
create or replace function public.guard_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if current_user not in ('anon', 'authenticated') or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_table_name = 'public_echoes' then
    if tg_op = 'INSERT' then
      -- moderate_new_echo skipped any row that arrived with check_content = true
      new.check_content        := false;
      new.likes_count          := 0;
      new.comment_count        := 0;
      new.repost_count         := 0;
      new.view_count           := 0;
      new.remix_count          := 0;
      new.mind_blown_count     := 0;
      new.taking_notes_count   := 0;
      new.agree_count          := 0;
      new.disagree_count       := 0;
      new.thoughtfulness_score := 0;
      new.embedding            := null;
      new.hls_url              := null;   -- nothing server-side writes this now; the client prefers it over media_urls
      new.co_author_id         := null;   -- no client path writes these; a forged value would put words in someone's mouth
      new.co_author_response   := null;
    else
      new.likes_count          := old.likes_count;
      new.comment_count        := old.comment_count;
      new.repost_count         := old.repost_count;
      new.view_count           := old.view_count;
      new.remix_count          := old.remix_count;
      new.mind_blown_count     := old.mind_blown_count;
      new.taking_notes_count   := old.taking_notes_count;
      new.agree_count          := old.agree_count;
      new.disagree_count       := old.disagree_count;
      new.thoughtfulness_score := old.thoughtfulness_score;
      new.embedding            := old.embedding;
      new.hls_url              := old.hls_url;
      new.co_author_id         := old.co_author_id;
      new.co_author_response   := old.co_author_response;
      -- §3: an edit is new content, so hide it until it passes moderation again
      new.check_content := case
        when (new.title, new.prompt, new.response, new.media_urls)
             is distinct from (old.title, old.prompt, old.response, old.media_urls)
        then false
        else old.check_content
      end;
    end if;

  elsif tg_table_name = 'ads' then
    if tg_op = 'INSERT' then
      new.payment_status    := 'pending';
      new.is_active         := false;
      new.budget_amount     := 0;      -- the amount and order are the server's to bind, or ₹1 buys any ad
      new.razorpay_order_id := null;
      new.views             := 0;
      new.clicks            := 0;
    else
      new.payment_status    := old.payment_status;
      new.is_active         := old.is_active;
      new.budget_amount     := old.budget_amount;
      new.razorpay_order_id := old.razorpay_order_id;
      new.views             := old.views;
      new.clicks            := old.clicks;
      new.advertiser_id     := old.advertiser_id;
    end if;

  elsif tg_table_name = 'learn_bookings' then
    if tg_op = 'INSERT' then
      -- A signed-in learner's request. Guest bookings come from
      -- learn-guest-booking with the service role, which never reaches here.
      new.status         := 'requested';
      new.payment_status := 'unpaid';
      new.meeting_room   := null;
      new.meeting_link   := null;
      new.homework       := null;
      new.follow_up      := null;
      new.guest_name     := null;
      new.guest_email    := null;
      new.guest_token    := null;
    else
      new.tutor_id    := old.tutor_id;
      new.learner_id  := old.learner_id;
      new.guest_name  := old.guest_name;
      new.guest_email := old.guest_email;
      new.guest_token := old.guest_token;
      new.package_id  := old.package_id;
      if v_uid is distinct from old.tutor_id then
        -- The learner can cancel and edit their own prep note. Accepting,
        -- scheduling, payment and the meeting belong to the tutor. A learner
        -- who could set 'accepted' could unlock every "learners only" lecture.
        new.status := case when new.status = 'cancelled' then 'cancelled' else old.status end;
        new.payment_status   := old.payment_status;
        new.scheduled_for    := old.scheduled_for;
        new.slot_id          := old.slot_id;
        new.duration_minutes := old.duration_minutes;
        new.meeting_room     := old.meeting_room;
        new.meeting_link     := old.meeting_link;
        new.homework         := old.homework;
        new.follow_up        := old.follow_up;
      end if;
    end if;

  elsif tg_table_name = 'dm_conversations' then
    if tg_op = 'UPDATE' then
      -- The app writes pinned_message_id directly. Every other column belongs
      -- to fn_sync_conv_last_message or the group-admin RPCs. A participant who
      -- could rewrite user_b could hand the whole thread to a third person.
      new.user_a            := old.user_a;
      new.user_b            := old.user_b;
      new.is_group          := old.is_group;
      new.created_by        := old.created_by;
      new.title             := old.title;
      new.avatar_color      := old.avatar_color;
      new.last_message_at   := old.last_message_at;
      new.last_message_text := old.last_message_text;
      new.last_message_kind := old.last_message_kind;
    end if;
  end if;

  return new;
end;
$$;

-- Named "a_" so it fires first. BEFORE triggers run in name order.
drop trigger if exists a_guard_client_writes on public.public_echoes;
create trigger a_guard_client_writes
  before insert or update on public.public_echoes
  for each row execute function public.guard_client_writes();

drop trigger if exists a_guard_client_writes on public.ads;
create trigger a_guard_client_writes
  before insert or update on public.ads
  for each row execute function public.guard_client_writes();

drop trigger if exists a_guard_client_writes on public.learn_bookings;
create trigger a_guard_client_writes
  before insert or update on public.learn_bookings
  for each row execute function public.guard_client_writes();

drop trigger if exists a_guard_client_writes on public.dm_conversations;
create trigger a_guard_client_writes
  before update on public.dm_conversations
  for each row execute function public.guard_client_writes();

revoke all on function public.guard_client_writes() from public, anon, authenticated;

-- ── §3 re-moderate edits ─────────────────────────────────────────────────────
-- moderate_new_echo returns early when check_content is true, so a metadata-only
-- update (the guard leaves check_content as it was) enqueues nothing.
drop trigger if exists trg_moderate_new_echo on public.public_echoes;
create trigger trg_moderate_new_echo
  after insert or update of title, prompt, response, media_urls on public.public_echoes
  for each row execute function public.moderate_new_echo();

-- ── §4 read paths ────────────────────────────────────────────────────────────
drop policy if exists "Anon can read echoes" on public.public_echoes;
drop policy if exists "Anon reads public moderated echoes" on public.public_echoes;
-- The policy below reads profiles.is_private, and anon has no grant on that
-- column. It only ever worked for anon because the USING (true) policy made
-- the planner discard it.
alter policy "Echoes are viewable by authorized users" on public.public_echoes to authenticated;
create policy "Anon reads public moderated echoes" on public.public_echoes
  for select to anon
  using (check_content and public.can_view_echo_author(author_id));

-- Daily answers follow the same private-account rule as echoes.
drop policy if exists "daily_answers select all" on public.daily_answers;
drop policy if exists "daily_answers readable by authorized users" on public.daily_answers;
create policy "daily_answers readable by authorized users" on public.daily_answers
  for select
  using (public.can_view_echo_author(user_id));

-- ── §5 abuse of shared machinery ─────────────────────────────────────────────
-- pg_cron runs the sweep as postgres, so it doesn't need these grants. A client
-- that could call it could queue 50 AI calls per request, indefinitely.
revoke execute on function public.resweep_unmoderated_echoes() from public, anon, authenticated;

-- check_app_rate_limit judged window expiry by the CALLER's p_window_seconds.
-- A client could pass 1, reset any counter, and bypass every insert trigger's
-- limit (posts, comments, DMs, follows, reports) along with the edge
-- functions' AI limits. Direct client calls are now restricted to the
-- client-side actions the app uses, for the caller's own id. Trigger calls
-- (pg_trigger_depth() > 0) and service_role calls keep the original behaviour.
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
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and pg_trigger_depth() = 0
  then
    if auth.uid() is null or p_user_id is distinct from auth.uid() then
      raise exception 'rate_limit_user_mismatch'
        using errcode = 'P0001';
    end if;
    if p_action not in (
      'avatar_upload_hour',
      'echo_image_upload_hour',
      'echo_video_upload_hour',
      'search_users_minute',
      'search_profiles_minute',
      'search_echoes_minute'
    ) then
      raise exception 'rate_limit_action_not_client_callable'
        using errcode = '42501';
    end if;
  end if;

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

-- ── §6 blocks and "Who can DM me" ────────────────────────────────────────────
-- user_blocks is readable only by the blocker, so these checks have to run as
-- definer. The helpers are internal: no client role can execute them, which
-- also keeps them from becoming an oracle for who has blocked whom.
create or replace function public.dm_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Starting a conversation, or adding someone to a group, needs no block in
-- either direction and has to pass the recipient's dm_privacy:
--   everyone  -> allowed
--   followers -> the sender has to follow the recipient
--   nobody    -> never
-- Conversations that already exist carry on. Only a block stops them (see
-- enforce_dm_blocks).
create or replace function public.dm_request_allowed(p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.dm_blocked_between(p_sender, p_recipient)
     and coalesce((
       select case p.dm_privacy
                when 'nobody' then false
                when 'followers' then exists (
                  select 1 from public.follows f
                   where f.follower_id = p_sender and f.following_id = p_recipient
                )
                else true
              end
         from public.profiles p
        where p.id = p_recipient
     ), true);
$$;

revoke all on function public.dm_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dm_request_allowed(uuid, uuid) from public, anon, authenticated;

-- New 1:1 conversations. This covers get_or_create_dm_conversation and direct
-- inserts alike, since both land here.
create or replace function public.enforce_dm_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
begin
  if v_uid is null or coalesce(new.is_group, false) then
    return new;
  end if;
  if new.user_a = v_uid then
    v_other := new.user_b;
  elsif new.user_b = v_uid then
    v_other := new.user_a;
  else
    return new;
  end if;
  if v_other is not null and not public.dm_request_allowed(v_uid, v_other) then
    raise exception 'dm_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_enforce_dm_requests on public.dm_conversations;
create trigger a_enforce_dm_requests
  before insert on public.dm_conversations
  for each row execute function public.enforce_dm_requests();

-- Every message in a 1:1 thread.
create or replace function public.enforce_dm_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end
    into v_other
    from public.dm_conversations c
   where c.id = new.conversation_id
     and coalesce(c.is_group, false) = false;
  if v_other is not null and public.dm_blocked_between(new.sender_id, v_other) then
    raise exception 'dm_blocked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists a_enforce_dm_blocks on public.direct_messages;
create trigger a_enforce_dm_blocks
  before insert on public.direct_messages
  for each row execute function public.enforce_dm_blocks();

-- Group adds. A member the adder may not message is skipped silently rather
-- than failing the whole request, so a group invite can't be used to find out
-- who has blocked you.
create or replace function public.enforce_group_adds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or new.user_id = v_uid then
    return new;
  end if;
  if not public.dm_request_allowed(v_uid, new.user_id) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists a_enforce_group_adds on public.dm_conversation_members;
create trigger a_enforce_group_adds
  before insert on public.dm_conversation_members
  for each row execute function public.enforce_group_adds();

revoke all on function public.enforce_dm_requests() from public, anon, authenticated;
revoke all on function public.enforce_dm_blocks() from public, anon, authenticated;
revoke all on function public.enforce_group_adds() from public, anon, authenticated;

-- ── §7 identity comes from the JWT ───────────────────────────────────────────
-- Same rule as get_personal_feed and get_semantic_feed: service_role may name
-- a user, and everyone else is who their token says they are. A null
-- p_user_id still means "not personalised". The bodies are the previous
-- definitions with p_user_id resolved through `caller` and page size capped.
create or replace function public.get_ranked_feed(
  p_user_id        uuid    default null,
  p_limit          int     default 20,
  p_gravity        float8  default 1.8,
  p_cursor_score   float8  default null,
  p_cursor_id      uuid    default null,
  p_following_only boolean default false
)
 returns table(id uuid, author_id uuid, title text, prompt text, response text, likes_count integer, comment_count integer, repost_count integer, view_count integer, created_at timestamp with time zone, media_urls text[], quoted_echo_id uuid, username text, display_name text, bio text, avatar_color text, avatar_url text, is_verified boolean, follower_count integer, rank_score double precision)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH caller AS (
    SELECT CASE
             WHEN coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               THEN p_user_id
             WHEN p_user_id IS NULL THEN NULL
             ELSE auth.uid()
           END AS uid
  ),
  scored AS (
    SELECT
      e.id,
      e.author_id,
      e.title,
      e.prompt,
      e.response,
      e.likes_count,
      e.comment_count,
      e.repost_count,
      e.view_count,
      e.created_at,
      e.media_urls,
      e.quoted_echo_id,
      p.username,
      p.display_name,
      p.bio,
      p.avatar_color,
      p.avatar_url,
      p.is_verified,
      p.follower_count,
      -- Use the materialized global score, and just add the cheap personalized follower boost
      (
        COALESCE(mv.global_score, 0)
        * (1.0 + log(greatest(p.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * CASE
            WHEN c.uid IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.follows f
              WHERE f.follower_id = c.uid AND f.following_id = e.author_id
            ) THEN 1.5 ELSE 1.0
          END
      ) AS rank_score
    FROM public.visible_echoes e
    CROSS JOIN caller c
    JOIN public.profiles p ON p.id = e.author_id
    LEFT JOIN public.trending_echoes_mv mv ON mv.id = e.id
    WHERE
      -- moderation gate: only surface content that has passed moderation
      e.check_content = true
      -- Block/mute filters
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = c.uid AND b.blocked_id = e.author_id
      ))
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_mutes m
        WHERE m.muter_id = c.uid AND m.muted_id = e.author_id
      ))
      -- Following-only scope
      AND (
        NOT p_following_only
        OR c.uid IS NULL
        OR EXISTS (
          SELECT 1 FROM public.follows f2
          WHERE f2.follower_id = c.uid AND (
            f2.following_id = e.author_id
            OR EXISTS (
              SELECT 1 FROM public.echo_reposts r
              WHERE r.echo_id = e.id AND r.user_id = f2.following_id
            )
          )
        )
      )
  )
  SELECT
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  FROM scored s
  WHERE
    -- Keyset pagination
    p_cursor_score IS NULL
    OR s.rank_score < p_cursor_score
    OR (s.rank_score = p_cursor_score AND s.id < p_cursor_id)
  ORDER BY s.rank_score DESC, s.id DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

create or replace function public.get_thinking_partners(
  p_user_id uuid,
  p_limit   int  default 12,
  p_mode    text default 'similar'   -- 'similar' | 'different'
)
returns table (
  id             uuid,
  username       text,
  display_name   text,
  bio            text,
  avatar_color   text,
  avatar_url     text,
  is_verified    bool,
  follower_count int,
  echo_count     int,
  affinity       float8   -- cosine similarity in [-1, 1]; 1 = identical taste
)
language sql stable security definer
set search_path = public, extensions
as $$
  with caller as (
    select case
             when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               then p_user_id
             else auth.uid()
           end as uid
  ),
  viewer as (
    select avg(e.embedding)::vector(768) as centroid
    from public.visible_echoes e
    where e.author_id = (select uid from caller)
      and e.embedding is not null
      and e.check_content = true
  ),
  candidates as (
    select
      e.author_id,
      avg(e.embedding)::vector(768) as centroid,
      count(*)::int                 as echo_count
    from public.visible_echoes e
    where e.author_id <> (select uid from caller)
      and e.embedding is not null
      and e.check_content = true
    group by e.author_id
    having count(*) >= 2   -- need a couple of echoes for a meaningful centroid
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_color,
    p.avatar_url,
    p.is_verified,
    p.follower_count,
    c.echo_count,
    (1 - (c.centroid <=> v.centroid))::float8 as affinity
  from candidates c
  join viewer v on true
  join public.profiles p on p.id = c.author_id
  where v.centroid is not null
    and not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = (select uid from caller) and b.blocked_id = c.author_id
    )
    and not exists (
      select 1 from public.user_mutes m
      where m.muter_id = (select uid from caller) and m.muted_id = c.author_id
    )
    and not exists (
      select 1 from public.follows f
      where f.follower_id = (select uid from caller) and f.following_id = c.author_id
    )
  -- 'similar' -> smallest distance first; 'different' -> largest distance first.
  order by (c.centroid <=> v.centroid) * (case when p_mode = 'different' then -1 else 1 end) asc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

create or replace function public.get_divergent_daily_answers(
  p_question_id uuid,
  p_viewer_id   uuid default null,
  p_limit       int  default 30
)
returns table (
  id            uuid,
  user_id       uuid,
  answer        text,
  echo_id       uuid,
  created_at    timestamptz,
  username      text,
  display_name  text,
  avatar_color  text,
  avatar_url    text,
  is_verified   bool,
  divergence    float8   -- cosine distance from the day's consensus (0..2); higher = more divergent
)
language sql stable security definer
set search_path = public, extensions
as $$
  with caller as (
    select case
             when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               then p_viewer_id
             else auth.uid()
           end as uid
  ),
  answers as (
    select a.id, a.user_id, a.answer, a.echo_id, a.created_at, a.embedding
    from public.daily_answers a
    where a.question_id = p_question_id
      and a.embedding is not null
      -- a definer function skips RLS, so it applies the private-account rule itself
      and public.can_view_echo_author(a.user_id)
  ),
  consensus as (
    select avg(embedding)::vector(768) as centroid
    from answers
  )
  select
    a.id,
    a.user_id,
    a.answer,
    a.echo_id,
    a.created_at,
    p.username,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    p.is_verified,
    (a.embedding <=> c.centroid)::float8 as divergence
  from answers a
  join consensus c on true
  cross join caller v
  join public.profiles p on p.id = a.user_id
  where c.centroid is not null
    and (v.uid is null or a.user_id <> v.uid)
    and (v.uid is null or not exists (
      select 1 from public.user_blocks b
      where b.blocker_id = v.uid and b.blocked_id = a.user_id
    ))
    and (v.uid is null or not exists (
      select 1 from public.user_mutes m
      where m.muter_id = v.uid and m.muted_id = a.user_id
    ))
  order by (a.embedding <=> c.centroid) desc   -- most divergent first
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

commit;
