-- Production schema snapshot, taken 2026-10-16 with:
--   supabase db dump --linked -f supabase/recovery/schema.sql
-- through migration: 20261015120000
-- (scripts/rebuild-db.sh replays every supabase/migrations/* newer than that line on top.)
-- Replays into an empty Supabase database with 0 errors. Extensions, tables, functions, policies,
-- triggers, the realtime publication and the trending matview are all here. NOT here: queues, cron
-- jobs, vault secrets, storage buckets, the auth signup trigger, content rows. See bootstrap.sql,
-- auth-storage.sql, seed-content.sql.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgmq";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."act_on_urgent_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hidden boolean := false;
begin
  -- Server-owned: a client inserting auto_hidden = true would otherwise put a
  -- hold on any echo without hiding it through this path.
  new.auto_hidden := false;
  if not public.report_reason_is_urgent(new.reason) then
    return new;
  end if;

  if new.target_type = 'echo' then
    update public.public_echoes
       set check_content = false
     where id = new.target_id
       and check_content is true;
    v_hidden := found;
  end if;
  new.auto_hidden := v_hidden;

  -- Every moderator hears about it; 'report_urgent' bypasses the daily push cap.
  -- Only the alert is guarded: a failed alert must never lose the report or
  -- undo the hide above.
  begin
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    select p.id, 'report_urgent', null, new.target_type, new.target_id,
           left(new.reason, 120) || case when v_hidden then ' · hidden pending review' else '' end
      from public.profiles p
     where p.is_moderator;
  exception when others then
    raise warning 'act_on_urgent_report alert failed: %', sqlerrm;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."act_on_urgent_report"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_member_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_group_admin(p_conversation_id);
  insert into public.dm_conversation_members (conversation_id, user_id, role)
  select p_conversation_id, member_id, 'member'
    from (select distinct unnest(p_member_ids) as member_id) s
   where member_id is not null
  on conflict do nothing;
  -- Cap group size (owner + 63).
  if (select count(*) from public.dm_conversation_members where conversation_id = p_conversation_id) > 64 then
    raise exception 'group is full';
  end if;
end;
$$;


ALTER FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_salon_owner_as_member"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.salon_members (salon_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;


ALTER FUNCTION "public"."add_salon_owner_as_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_comment_likes_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.echo_comments
       set likes_count = coalesce(likes_count, 0) + 1
     where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.echo_comments
       set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
     where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_comment_likes_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_comment_reaction_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare v_col text;
begin
  v_col := case
    when coalesce(new.reaction, old.reaction) = 'mind_blown'   then 'mind_blown_count'
    when coalesce(new.reaction, old.reaction) = 'taking_notes' then 'taking_notes_count'
    when coalesce(new.reaction, old.reaction) = 'agree'        then 'agree_count'
    when coalesce(new.reaction, old.reaction) = 'disagree'     then 'disagree_count'
    else null end;
  if v_col is null then return null; end if;
  if tg_op = 'INSERT' then
    execute format('update public.echo_comments set %I = coalesce(%I,0) + 1 where id = $1', v_col, v_col) using new.comment_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.echo_comments set %I = greatest(coalesce(%I,0) - 1, 0) where id = $1', v_col, v_col) using old.comment_id;
  end if;
  return null;
end $_$;


ALTER FUNCTION "public"."adjust_comment_reaction_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set comment_count = comment_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set comment_count = greatest(0, comment_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_echo_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_likes_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set likes_count = likes_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set likes_count = greatest(0, likes_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_echo_likes_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_reaction_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare v_col text;
begin
  v_col := case
    when coalesce(new.reaction, old.reaction) = 'mind_blown'   then 'mind_blown_count'
    when coalesce(new.reaction, old.reaction) = 'taking_notes' then 'taking_notes_count'
    when coalesce(new.reaction, old.reaction) = 'agree'        then 'agree_count'
    when coalesce(new.reaction, old.reaction) = 'disagree'     then 'disagree_count'
    else null end;
  if v_col is null then return null; end if;
  if tg_op = 'INSERT' then
    execute format('update public.public_echoes set %I = coalesce(%I,0) + 1 where id = $1', v_col, v_col) using new.echo_id;
  elsif tg_op = 'DELETE' then
    execute format('update public.public_echoes set %I = greatest(coalesce(%I,0) - 1, 0) where id = $1', v_col, v_col) using old.echo_id;
  end if;
  return null;
end $_$;


ALTER FUNCTION "public"."adjust_echo_reaction_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_remix_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' and new.parent_echo_id is not null then
    update public.public_echoes
      set remix_count = remix_count + 1
      where id = new.parent_echo_id;
  elsif tg_op = 'DELETE' and old.parent_echo_id is not null then
    update public.public_echoes
      set remix_count = greatest(0, remix_count - 1)
      where id = old.parent_echo_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_echo_remix_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_repost_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set repost_count = repost_count + 1 where id = new.echo_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.public_echoes set repost_count = greatest(0, repost_count - 1) where id = old.echo_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_echo_repost_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_echo_view_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.public_echoes set view_count = view_count + 1 where id = new.echo_id;
    return new;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."adjust_echo_view_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_follower_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
       SET follower_count = follower_count + 1
     WHERE id = new.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
       SET follower_count = greatest(0, follower_count - 1)
     WHERE id = old.following_id;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."adjust_follower_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_oh_question_upvote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.office_hour_questions set upvote_count = upvote_count + 1 where id = new.question_id;
  elsif tg_op = 'DELETE' then
    update public.office_hour_questions set upvote_count = greatest(upvote_count - 1, 0) where id = old.question_id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."adjust_oh_question_upvote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_oh_rsvp_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.office_hours set rsvp_count = rsvp_count + 1 where id = new.office_hour_id;
  elsif tg_op = 'DELETE' then
    update public.office_hours set rsvp_count = greatest(rsvp_count - 1, 0) where id = old.office_hour_id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."adjust_oh_rsvp_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_salon_echo_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' and new.salon_id is not null then
    update public.salons set echo_count = echo_count + 1 where id = new.salon_id;
  elsif tg_op = 'DELETE' and old.salon_id is not null then
    update public.salons set echo_count = greatest(echo_count - 1, 0) where id = old.salon_id;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.salon_id::text, '') <> coalesce(new.salon_id::text, '') then
      if old.salon_id is not null then
        update public.salons set echo_count = greatest(echo_count - 1, 0) where id = old.salon_id;
      end if;
      if new.salon_id is not null then
        update public.salons set echo_count = echo_count + 1 where id = new.salon_id;
      end if;
    end if;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."adjust_salon_echo_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_salon_member_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.salons set member_count = member_count + 1 where id = new.salon_id;
  elsif tg_op = 'DELETE' then
    update public.salons set member_count = greatest(member_count - 1, 0) where id = old.salon_id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."adjust_salon_member_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adult_age_years"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$ select 18 $$;


ALTER FUNCTION "public"."adult_age_years"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_touch_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.ai_conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."ai_touch_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alt_texts_ok"("p" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  select p is null
      or (coalesce(array_length(p, 1), 0) <= 10
          and not exists (select 1 from unnest(p) a where char_length(a) > 400));
$$;


ALTER FUNCTION "public"."alt_texts_ok"("p" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_store_entitlement"("p_user" "uuid", "p_row" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (select 1 from auth.users where id = p_user) then
    return; -- the account is gone; there is nothing to entitle
  end if;
  insert into public.user_entitlements as ue (user_id, plan_id, status, source, current_period_end, updated_at)
  values (
    p_user,
    p_row->>'plan_id',
    p_row->>'status',
    p_row->>'source',
    (p_row->>'current_period_end')::timestamptz,
    now()
  )
  on conflict (user_id) do update
     set plan_id            = excluded.plan_id,
         status             = excluded.status,
         source             = excluded.source,
         current_period_end = excluded.current_period_end,
         updated_at         = now()
   where ue.source in ('app_store', 'play_store', 'stripe')
      or (ue.source = 'manual' and ue.plan_id = 'free');
end;
$$;


ALTER FUNCTION "public"."apply_store_entitlement"("p_user" "uuid", "p_row" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_follow"("p_requester" "uuid", "p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform set_config('echo.approving_follow', '1', true);
  insert into public.follows (follower_id, following_id)
  values (p_requester, p_target)
  on conflict do nothing;
  perform set_config('echo.approving_follow', '', true);

  insert into public.notifications (user_id, type, actor_id)
  values (p_requester, 'follow_accepted', p_target)
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."approve_follow"("p_requester" "uuid", "p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_group_admin"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admins only';
  end if;
end;
$$;


ALTER FUNCTION "public"."assert_group_admin"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."breaker_record"("p_provider" "text", "p_ok" boolean, "p_retry_after" integer) RETURNS TABLE("failures" integer, "open_until" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_failures integer;
begin
  if p_ok then
    update public.provider_breaker b
       set failures = 0, open_until = null, updated_at = now()
     where b.provider = p_provider;
    return query select 0, null::timestamptz;
    return;
  end if;

  insert into public.provider_breaker as b (provider, failures, updated_at)
  values (p_provider, 1, now())
  on conflict (provider) do update set failures = b.failures + 1, updated_at = now()
  returning b.failures into v_failures;

  update public.provider_breaker b
     set open_until = case
           when coalesce(p_retry_after, 0) > 0
             then now() + make_interval(secs => least(p_retry_after, 3600))
           when v_failures >= 3
             then now() + make_interval(secs => least(3600, 30 * power(2, v_failures - 3)::integer))
           else b.open_until
         end
   where b.provider = p_provider;

  return query select b.failures, b.open_until from public.provider_breaker b where b.provider = p_provider;
end;
$$;


ALTER FUNCTION "public"."breaker_record"("p_provider" "text", "p_ok" boolean, "p_retry_after" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."breaker_state"("p_provider" "text") RETURNS TABLE("failures" integer, "open_until" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select b.failures, b.open_until from public.provider_breaker b where b.provider = p_provider;
$$;


ALTER FUNCTION "public"."breaker_state"("p_provider" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_echo_content_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 1;
  elsif (new.title, new.prompt, new.response, new.media_urls, new.media_alt)
        is distinct from (old.title, old.prompt, old.response, old.media_urls, old.media_alt) then
    new.content_version := old.content_version + 1;
    new.moderated_at := null;
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."bump_echo_content_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_quote_repost_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if TG_OP = 'INSERT' and new.quoted_echo_id is not null then
    update public.public_echoes
       set repost_count = repost_count + 1
     where id = new.quoted_echo_id;
  elsif TG_OP = 'DELETE' and old.quoted_echo_id is not null then
    update public.public_echoes
       set repost_count = greatest(repost_count - 1, 0)
     where id = old.quoted_echo_id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."bump_quote_repost_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_be_profiled"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_adult(p_uid);
$$;


ALTER FUNCTION "public"."can_be_profiled"("p_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_be_profiled"("p_uid" "uuid") IS 'Whether this user may be shown targeted advertising or have their behaviour profiled for personalised notifications. Fails closed on unknown age.';



CREATE OR REPLACE FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Mirrors the RLS policy on public_echoes exactly. If that policy changes,
  -- this must change with it.
  select
    auth.uid() = p_author_id
    or exists (
      select 1 from public.profiles p
      where p.id = p_author_id and p.is_private = false
    )
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = p_author_id
    );
$$;


ALTER FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") IS 'Whether the calling user may see echoes by this author. Mirrors the RLS policy on public_echoes, for SECURITY DEFINER functions that bypass it.';



CREATE OR REPLACE FUNCTION "public"."cancel_follow_request"("p_target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  delete from public.follow_requests where requester_id = v_uid and target_id = p_target;
  delete from public.notifications
   where user_id = p_target and type = 'follow_request' and actor_id = v_uid;
end;
$$;


ALTER FUNCTION "public"."cancel_follow_request"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cap_user_devices"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.user_devices
     set revoked_at = now()
   where id in (
     select id from public.user_devices
      where user_id = new.user_id and revoked_at is null
      order by coalesce(last_seen_at, created_at) desc
      offset 9
   );
  return new;
end;
$$;


ALTER FUNCTION "public"."cap_user_devices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_ad_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.payment_status != 'paid' THEN
    NEW.is_active = false;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_ad_payment_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_app_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer, "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."check_app_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_daily_broadcast"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_question uuid;
  v_batches integer;
begin
  select id into v_question from public.ensure_daily_question(current_date);
  if v_question is null then
    return 0;
  end if;

  insert into public.broadcast_runs (question_id) values (v_question)
  on conflict (question_id) do nothing;
  if not found then
    return 0;
  end if;

  -- Everyone with a device, in batches of 100 users for the worker.
  with recipients as (
    select user_id from public.push_tokens
    union
    select id from public.profiles where push_token is not null
  ),
  numbered as (
    select user_id, (row_number() over (order by user_id) - 1) / 100 as batch
      from recipients
  )
  select count(*) into v_batches
    from (
      select public.jobs_enqueue('broadcast', jsonb_build_object(
               'question_id', v_question, 'user_ids', jsonb_agg(user_id)))
        from numbered
       group by batch
    ) enqueued;
  return v_batches;
end;
$$;


ALTER FUNCTION "public"."claim_daily_broadcast"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_nudges"("p_hour" integer, "p_limit" integer, "p_min_gap_hours" integer) RETURNS TABLE("user_id" "uuid", "top_surface" "text", "date_of_birth" "date")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with due as (
    select np.user_id
      from public.notification_profiles np
      join public.profiles p on p.id = np.user_id
     where p.personalized_notifications
       and np.best_hours @> array[p_hour]
       and (np.last_nudged_at is null
            or np.last_nudged_at < now() - make_interval(hours => p_min_gap_hours))
       and (p.push_token is not null
            or exists (select 1 from public.push_tokens t where t.user_id = np.user_id))
     order by np.last_nudged_at nulls first
     limit greatest(p_limit, 0)
     for update of np skip locked
  )
  update public.notification_profiles np
     set last_nudged_at = now()
    from due, public.profiles p
   where np.user_id = due.user_id
     and p.id = due.user_id
  returning np.user_id, np.top_surface, p.date_of_birth;
$$;


ALTER FUNCTION "public"."claim_due_nudges"("p_hour" integer, "p_limit" integer, "p_min_gap_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_on_echo_unlike"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.notifications
  where type        = 'like'
    and actor_id    = old.user_id
    and target_id   = old.echo_id      -- was old.echo_id::text (uuid vs text)
    and target_kind = 'echo';
  return old;
end;
$$;


ALTER FUNCTION "public"."cleanup_on_echo_unlike"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_conversation"("p_title" "text", "p_member_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := nullif(trim(p_title), '');
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) < 1 then
    raise exception 'choose at least one member';
  end if;

  insert into public.dm_conversations (user_a, user_b, is_group, title, avatar_color, created_by)
  values (v_uid, null, true, coalesce(v_title, 'Group chat'), '#6366F1', v_uid)
  returning id into v_conversation_id;

  insert into public.dm_conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_uid, 'admin')
  on conflict do nothing;

  insert into public.dm_conversation_members (conversation_id, user_id, role)
  select v_conversation_id, member_id, 'member'
    from (
      select distinct unnest(p_member_ids) as member_id
    ) s
   where member_id is not null
     and member_id <> v_uid
   limit 31
  on conflict do nothing;

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."create_group_conversation"("p_title" "text", "p_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cron_health"() RETURNS TABLE("unhealthy" integer, "detail" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select f.unhealthy,
         case
           when coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
                in ('anon', 'authenticated')
           then null
           else f.detail
         end
    from public.cron_health_full() f
$$;


ALTER FUNCTION "public"."cron_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cron_health_full"() RETURNS TABLE("unhealthy" integer, "detail" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $$
  with expected as (
    select * from (values
      ('daily-question-push',     interval '25 hours'),
      ('personalized-fanout',     interval '2 hours'),
      ('refresh_trending_echoes', interval '15 minutes'),
      ('ops-probe',               interval '90 minutes'),
      ('jobs-sweeper',            interval '10 minutes')
    ) as t(jobname, max_gap)
  ),
  last_ok as (
    select j.jobname,
           max(d.end_time) filter (where d.status = 'succeeded') as ok_at
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
    where j.active
    group by j.jobname
  ),
  stale as (
    select case
             when l.jobname is null then e.jobname || ': not scheduled'
             when l.ok_at is null   then e.jobname || ': never succeeded'
             when now() - l.ok_at > e.max_gap
               then e.jobname || ': last success ' || age(now(), l.ok_at)
           end as problem
    from expected e
    left join last_ok l on l.jobname = e.jobname
  ),
  http as (
    select count(*) as failures
    from net._http_response
    where created > now() - interval '2 hours'
      and (status_code is null or status_code >= 400)
  ),
  probes as (
    select string_agg(distinct r.check_name || ': ' || r.detail, '; ') as problem,
           count(*) as failing
    from public.probe_runs r
    join (
      select check_name, max(ran_at) as ran_at
        from public.probe_runs
       group by check_name
    ) latest on latest.check_name = r.check_name and latest.ran_at = r.ran_at
    where not r.ok
      and r.ran_at > now() - interval '3 hours'
  ),
  jobs as (
    select string_agg(problem, '; ') as problem, count(*) as failing
    from public.jobs_health()
  )
  select
    ((select count(*) from stale where problem is not null)
      + (select case when failures > 0 then 1 else 0 end from http)
      + (select case when failing > 0 then 1 else 0 end from probes)
      + (select case when failing > 0 then 1 else 0 end from jobs))::int,
    coalesce(
      nullif(concat_ws('; ',
        (select string_agg(problem, '; ') from stale where problem is not null),
        (select case when failures > 0
                then failures || ' failing pg_net responses in 2h' end from http),
        (select problem from probes),
        (select problem from jobs)
      ), ''),
      'all scheduled jobs healthy');
$$;


ALTER FUNCTION "public"."cron_health_full"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cron_health_full"() IS 'Scheduled-job health for the external healthcheck. Checks that jobs ran AND that pg_net calls succeeded — pg_cron reports success for a job that did nothing.';



CREATE OR REPLACE FUNCTION "public"."daily_answers_keep_keys"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.question_id is distinct from old.question_id or new.user_id is distinct from old.user_id then
    raise exception 'daily_answers: question_id and user_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."daily_answers_keep_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  -- Best-effort object cleanup. Direct storage DML is disallowed on current
  -- Supabase; if that ever changes this reclaims the files, and until then
  -- the exception guard keeps deletion working. Orphaned objects are keyed
  -- by the deleted uid and unreachable through the app.
  begin
    delete from storage.objects
     where bucket_id in ('avatars', 'echo-media', 'dm-media', 'marketplace-photos', 'verification')
       and split_part(name, '/', 1) = v_uid::text;
  exception when others then
    null;
  end;
end;
$$;


ALTER FUNCTION "public"."delete_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_blocked_between"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;


ALTER FUNCTION "public"."dm_blocked_between"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_request_allowed"("p_sender" "uuid", "p_recipient" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dm_request_allowed"("p_sender" "uuid", "p_recipient" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."echo_is_held"("p_echo_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
           select 1 from public.moderation_decisions md
            where md.echo_id = p_echo_id
              and md.decision_type in ('content_removed', 'content_restricted')
              and not exists (
                select 1 from public.appeals a
                 where a.decision_id = md.id and a.status = 'overturned'
              )
         )
      or exists (
           select 1 from public.reports r
            where r.target_type = 'echo'
              and r.target_id = p_echo_id
              and r.auto_hidden
              and r.status in ('open', 'reviewing')
         );
$$;


ALTER FUNCTION "public"."echo_is_held"("p_echo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_dm_blocks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_dm_blocks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_dm_requests"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_dm_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_group_adds"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_group_adds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_insert_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_insert_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_minor_profiling_off"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.personalized_notifications
     and not coalesce(
       extract(year from age(current_date, new.date_of_birth))::int
         >= public.adult_age_years(), false)
  then
    new.personalized_notifications := false;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_minor_profiling_off"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_profile_update_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_profile_update_rate_limit"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."daily_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "active_date" "date" NOT NULL,
    "question" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_questions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_daily_question"("target" "date" DEFAULT CURRENT_DATE) RETURNS "public"."daily_questions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  row_out   public.daily_questions;
  bank_size int;
  pick      text;
begin
  select * into row_out from public.daily_questions where active_date = target;
  if found then
    return row_out;
  end if;

  select count(*) into bank_size from public.daily_question_bank;
  if bank_size = 0 then
    return null;
  end if;

  select question into pick
    from public.daily_question_bank
   order by sort_order, id
   offset ((target - date '2026-01-01') % bank_size)
   limit 1;

  insert into public.daily_questions (active_date, question)
  values (target, pick)
  on conflict (active_date) do nothing;

  select * into row_out from public.daily_questions where active_date = target;
  return row_out;
end;
$$;


ALTER FUNCTION "public"."ensure_daily_question"("target" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."erase_account_rows"("p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
end;
$$;


ALTER FUNCTION "public"."erase_account_rows"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expense_stats"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("income_month" numeric, "expense_month" numeric, "net_month" numeric, "tx_count" integer, "budget" numeric, "currency" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select
    coalesce(sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date), 0),
    coalesce(sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date), 0),
    coalesce(sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date), 0)
      - coalesce(sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date), 0),
    count(*) filter (where date >= date_trunc('month', current_date)::date)::int,
    (select budget from public.expense_settings where user_id = p_user),
    (select currency from public.expense_settings where user_id = p_user)
  from public.expense_tx
  where user_id = p_user;
$$;


ALTER FUNCTION "public"."expense_stats"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fanout_friend_post_batch"("p_echo_id" "uuid", "p_author_id" "uuid", "p_preview" "text", "p_after" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 500) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."fanout_friend_post_batch"("p_echo_id" "uuid", "p_author_id" "uuid", "p_preview" "text", "p_after" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fanout_push_on_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(current_setting('echo.bulk_fanout', true), '') = 'on' then
    perform pgmq.send('push', jsonb_build_object('notification_id', new.id));
  else
    perform public.jobs_enqueue('push', jsonb_build_object('notification_id', new.id));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."fanout_push_on_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) RETURNS double precision
    LANGUAGE "sql" STABLE PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $$
  select (
    -- Engagement, weighted by how much each signal costs the person giving it,
    -- plus a floor so an unengaged new post still has a score to decay.
    ((coalesce(p_likes, 0) * 3.0
      + coalesce(p_comments, 0) * 5.0
      + coalesce(p_reposts, 0) * 4.0
      + coalesce(p_views, 0) * 0.3
      + 1.5)
     / power(greatest(extract(epoch from now() - p_created_at) / 3600.0, 0.1) + 2.0, 1.8))
    -- Engagement rate: ten likes from twenty readers beats ten from a thousand.
    * (1.0 + (coalesce(p_likes, 0) + coalesce(p_comments, 0) + coalesce(p_reposts, 0))::float8
             / greatest(coalesce(p_views, 0), 1)::float8 * 2.0)
    * case when coalesce(p_has_media, false) then 1.2 else 1.0 end
  )::double precision;
$$;


ALTER FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) IS 'The one engagement-over-age curve the feed ranks by. Used by trending_echoes_mv and, for posts outside its window, directly by the feed RPCs.';



CREATE OR REPLACE FUNCTION "public"."fitness_stats"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("calories_today" numeric, "protein_today" numeric, "water_today_ml" numeric, "workouts_week" integer, "latest_weight_kg" numeric, "log_streak" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with logged_days as (
    select date from public.fitness_meal    where user_id = p_user
    union select date from public.fitness_workout where user_id = p_user
    union select date from public.fitness_water   where user_id = p_user
  ),
  streak as (
    select date, date - (row_number() over (order by date))::int as grp from logged_days
  ),
  runs as (
    select grp, count(*) len, max(date) run_end from streak group by grp
  )
  select
    coalesce((select sum(calories) from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((select sum(protein)  from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((select sum(ml)       from public.fitness_water where user_id = p_user and date = current_date), 0),
    coalesce((select count(*)::int from public.fitness_workout where user_id = p_user and date >= date_trunc('week', current_date)::date), 0),
    (select kg from public.fitness_weight where user_id = p_user order by date desc limit 1),
    coalesce((select len::int from runs where run_end >= current_date - 1 order by run_end desc limit 1), 0);
$$;


ALTER FUNCTION "public"."fitness_stats"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_daily_reaction_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author  uuid;
  v_snippet text;
begin
  select user_id, left(answer, 60)
    into v_author, v_snippet
    from public.daily_answers
   where id = new.answer_id;

  -- No self-notify, and nothing to do if the answer vanished.
  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_author, 'daily_react', new.user_id, new.answer_id, 'daily_answer',
          new.emoji || '  ' || v_snippet);

  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_daily_reaction_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_dm_push_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_recipient_id uuid;
  v_preview      text;
begin
  select case when user_a = new.sender_id then user_b else user_a end
    into v_recipient_id
    from public.dm_conversations
   where id = new.conversation_id;
  if v_recipient_id is null or v_recipient_id = new.sender_id then
    return new;
  end if;
  -- Recipient muted this conversation (indefinitely or until muted_until).
  if exists (
    select 1 from public.dm_prefs
     where conversation_id = new.conversation_id
       and user_id = v_recipient_id
       and (muted = true or (muted_until is not null and muted_until > now()))
  ) then
    return new;
  end if;
  v_preview := case
    when new.ciphertext is not null then null
    when new.kind = 'image' then '📷 Photo'
    when new.kind = 'voice' then '🎙️ Voice message'
    when new.kind = 'echo'  then '💬 Shared an Echo'
    else left(coalesce(new.text, ''), 140)
  end;
  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_recipient_id, 'dm', new.sender_id, new.conversation_id, 'dm_conversation', v_preview);
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_dm_push_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_friend_daily_answer_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."fn_friend_daily_answer_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_friend_post_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."fn_friend_post_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_learn_booking_requires_party"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.learner_id is null and (new.guest_name is null or new.guest_token is null) then
    raise exception 'a booking needs either a learner or a named guest with a token'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_learn_booking_requires_party"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_social_task_notify"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."fn_social_task_notify"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_conv_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update dm_conversations
     set last_message_at   = new.created_at,
         last_message_text = case
                               when new.ciphertext is not null then null
                               when new.kind = 'echo'  then 'Shared an Echo'
                               when new.kind = 'image' then 'Photo'
                               when new.kind = 'voice' then 'Voice message'
                               else new.text
                             end,
         last_message_kind = new.kind
   where id = new.conversation_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_sync_conv_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."following_fitness_leaderboard"() RETURNS TABLE("user_id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "avatar_color" "text", "is_self" boolean, "workouts_week" integer, "active_30d" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with eligible as (
    select auth.uid() as user_id, true as is_self
    union
    select f.following_id, false
    from public.follows f
    join public.mini_app_share s on s.user_id = f.following_id and s.share_fitness
    where f.follower_id = auth.uid()
  ),
  logged as (
    select user_id, date from public.fitness_workout where user_id in (select user_id from eligible)
    union select user_id, date from public.fitness_meal where user_id in (select user_id from eligible)
    union select user_id, date from public.fitness_water where user_id in (select user_id from eligible)
  ),
  wk as (
    select user_id, count(*) as workouts_week
    from public.fitness_workout
    where user_id in (select user_id from eligible) and date >= date_trunc('week', current_date)::date
    group by user_id
  ),
  act as (
    select user_id, count(distinct date) as active_30d
    from logged where date > current_date - 30 group by user_id
  )
  select e.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color, e.is_self,
    coalesce(wk.workouts_week, 0)::int, coalesce(act.active_30d, 0)::int
  from eligible e
  join public.profiles p on p.id = e.user_id
  left join wk on wk.user_id = e.user_id
  left join act on act.user_id = e.user_id
  order by coalesce(wk.workouts_week, 0) desc, coalesce(act.active_30d, 0) desc, p.username;
$$;


ALTER FUNCTION "public"."following_fitness_leaderboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."following_habit_leaderboard"() RETURNS TABLE("user_id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "avatar_color" "text", "is_self" boolean, "best_streak" integer, "entries_30d" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with eligible as (
    select auth.uid() as user_id, true as is_self
    union
    select f.following_id, false
    from public.follows f
    join public.mini_app_share s on s.user_id = f.following_id and s.share_habits
    where f.follower_id = auth.uid()
  ),
  days as (
    select he.user_id, he.habit_client_id, he.date
    from public.habit_entry he
    join eligible e on e.user_id = he.user_id
  ),
  grouped as (
    select user_id, habit_client_id, date,
      date - (row_number() over (partition by user_id, habit_client_id order by date))::int as grp
    from days
  ),
  runs as (
    select user_id, habit_client_id, grp, count(*) as len, max(date) as run_end
    from grouped group by user_id, habit_client_id, grp
  ),
  cur as (
    select user_id, max(len) filter (where run_end >= current_date - 1) as best_streak
    from runs group by user_id
  ),
  ent as (
    select user_id, count(*) filter (where date > current_date - 30) as entries_30d
    from days group by user_id
  )
  select e.user_id, p.username, p.display_name, p.avatar_url, p.avatar_color, e.is_self,
    coalesce(cur.best_streak, 0)::int, coalesce(ent.entries_30d, 0)::int
  from eligible e
  join public.profiles p on p.id = e.user_id
  left join cur on cur.user_id = e.user_id
  left join ent on ent.user_id = e.user_id
  order by coalesce(cur.best_streak, 0) desc, coalesce(ent.entries_30d, 0) desc, p.username;
$$;


ALTER FUNCTION "public"."following_habit_leaderboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_divergent_daily_answers"("p_question_id" "uuid", "p_viewer_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 30) RETURNS TABLE("id" "uuid", "user_id" "uuid", "answer" "text", "echo_id" "uuid", "created_at" timestamp with time zone, "username" "text", "display_name" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "divergence" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."get_divergent_daily_answers"("p_question_id" "uuid", "p_viewer_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dm_conversations"("p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("id" "uuid", "other_user_id" "uuid", "other_username" "text", "other_display_name" "text", "other_avatar_color" "text", "other_last_seen_at" timestamp with time zone, "is_group" boolean, "group_title" "text", "group_avatar_color" "text", "member_count" bigint, "last_message_at" timestamp with time zone, "last_message_text" "text", "last_message_kind" "text", "unread_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with caller as (
    select case
      when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
        then coalesce(p_user_id, auth.uid())
      else auth.uid()
    end as uid
  ),
  visible_conversations as (
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_a = caller.uid
    union all
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_b = caller.uid
    union all
    select dc.*
      from public.dm_conversation_members m
      join public.dm_conversations dc on dc.id = m.conversation_id, caller
     where caller.uid is not null
       and m.user_id = caller.uid
       and coalesce(dc.is_group, false) = true
  )
  select
    dc.id,
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end as other_user_id,
    p.username as other_username,
    p.display_name as other_display_name,
    p.avatar_color as other_avatar_color,
    p.last_seen_at as other_last_seen_at,
    dc.is_group,
    dc.title as group_title,
    coalesce(dc.avatar_color, '#6366F1') as group_avatar_color,
    case
      when dc.is_group then (
        select count(*) from public.dm_conversation_members m where m.conversation_id = dc.id
      )
      else 2
    end as member_count,
    dc.last_message_at,
    dc.last_message_text,
    dc.last_message_kind,
    (
      select count(*)
        from public.direct_messages dm
       where dm.conversation_id = dc.id
         and dm.sender_id != caller.uid
         and dm.read_at is null
         and dm.deleted_at is null
         and not exists (
           select 1
             from public.direct_messages dm2
            where dm2.conversation_id = dc.id
              and dm2.sender_id = caller.uid
              and dm2.created_at >= dm.created_at
         )
    ) as unread_count
  from visible_conversations dc
  cross join caller
  left join public.profiles p on p.id = (
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end
  )
  order by dc.last_message_at desc nulls last;
$$;


ALTER FUNCTION "public"."get_dm_conversations"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") RETURNS TABLE("user_id" "uuid", "username" "text", "display_name" "text", "avatar_color" "text", "avatar_url" "text", "role" "text", "joined_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.user_id, p.username, p.display_name, p.avatar_color, p.avatar_url, m.role, m.joined_at
    from public.dm_conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_conversation_id
     and public.is_dm_conversation_member(p_conversation_id, auth.uid())
   order by (m.role = 'admin') desc, lower(coalesce(p.display_name, p.username));
$$;


ALTER FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_rank"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with me as (select auth.uid() as uid),
  b as (select * from public.rank_breakdowns(array[(select uid from me)]))
  select case when (select uid from me) is null then null else json_build_object(
    'points', coalesce((select post_pts + coauthor_pts + comments_received_pts + reposts_received_pts
                          + likes_received_pts + comments_made_pts from b), 0),
    'last_active_at', (select last_active_at from b),
    'breakdown', json_build_object(
      'posts',             coalesce((select post_pts from b), 0),
      'coauthor',          coalesce((select coauthor_pts from b), 0),
      'comments_received', coalesce((select comments_received_pts from b), 0),
      'reposts_received',  coalesce((select reposts_received_pts from b), 0),
      'likes_received',    coalesce((select likes_received_pts from b), 0),
      'comments_made',     coalesce((select comments_made_pts from b), 0)
    )
  ) end;
$$;


ALTER FUNCTION "public"."get_my_rank"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_dm_conversation"("p_recipient_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_conversation_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  if p_recipient_id is null or p_recipient_id = v_uid then
    raise exception 'invalid recipient';
  end if;

  if v_uid < p_recipient_id then
    v_user_a := v_uid;
    v_user_b := p_recipient_id;
  else
    v_user_a := p_recipient_id;
    v_user_b := v_uid;
  end if;

  select id
    into v_conversation_id
    from public.dm_conversations
   where coalesce(is_group, false) = false
     and user_a = v_user_a
     and user_b = v_user_b
   limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.dm_conversations (user_a, user_b, is_group)
  values (v_user_a, v_user_b, false)
  on conflict (user_a, user_b) do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id
      into v_conversation_id
      from public.dm_conversations
     where coalesce(is_group, false) = false
       and user_a = v_user_a
       and user_b = v_user_b
     limit 1;
  end if;

  if v_conversation_id is null then
    raise exception 'could not create conversation';
  end if;

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_dm_conversation"("p_recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personal_feed"("p_user_id" "uuid", "p_limit" integer DEFAULT 20, "p_cursor_score" double precision DEFAULT NULL::double precision, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_session_seed" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "author_id" "uuid", "title" "text", "prompt" "text", "response" "text", "likes_count" integer, "comment_count" integer, "repost_count" integer, "view_count" integer, "created_at" timestamp with time zone, "media_urls" "text"[], "quoted_echo_id" "uuid", "username" "text", "display_name" "text", "bio" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "follower_count" integer, "rank_score" double precision, "source" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_uid                uuid;
  v_taste              extensions.vector(768);
  v_updated            timestamptz;
  v_cand_trend_limit   int;
  v_cand_explore_limit int;
begin
  -- Identity comes from the JWT, never from the parameter. The parameter is
  -- kept for signature compatibility and is advisory only; service_role may
  -- still pass an explicit id because it has no auth.uid() of its own.
  v_uid := case
    when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      then coalesce(p_user_id, auth.uid())
    else auth.uid()
  end;

  -- Stage 0: eligibility. A user who cannot be profiled never reaches the
  -- personalized path at all, so DSA compliance is structural.
  if v_uid is null or not public.can_be_profiled(v_uid) then
    return query
      select r.id, r.author_id, r.title, r.prompt, r.response,
             r.likes_count, r.comment_count, r.repost_count, r.view_count,
             r.created_at, r.media_urls, r.quoted_echo_id,
             r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
             r.is_verified, r.follower_count, r.rank_score, 'ranked'::text
        from public.get_ranked_feed(v_uid, p_limit, 1.8, p_cursor_score, p_cursor_id, false) r;
    return;
  end if;

  -- Lazy taste refresh: cost scales with DAU, not registered users. The
  -- refresh is gated on p_cursor_score being null (I3) so the vector stays
  -- frozen for the lifetime of a cursor -- a refresh mid-scroll would re-score
  -- every semantic candidate and break keyset pagination.
  select ut.taste_vector, ut.updated_at into v_taste, v_updated
    from public.user_taste ut where ut.user_id = v_uid;

  if p_cursor_score is null
     and (v_updated is null or v_updated < now() - interval '6 hours') then
    perform public.refresh_user_taste(v_uid);
    select ut.taste_vector into v_taste
      from public.user_taste ut where ut.user_id = v_uid;
  end if;

  -- M1(a): cold-start candidate mix shift. A null taste vector means
  -- cand_semantic already yields nothing, so widen trending and exploration
  -- to fill the gap; follow stays at its standard limit either way.
  v_cand_trend_limit   := case when v_taste is null then 150 else 100 end;
  v_cand_explore_limit := case when v_taste is null then 100 else 50 end;

  return query
  with seen as (
    select v.echo_id from public.echo_views v
     where v.user_id = v_uid
       and v.created_at > now() - interval '90 days'
  ),
  -- Candidate generation (C1): each source is index-driven and bounded, and
  -- carries only the predicates it needs to stay on its index. Nothing here
  -- reads more than `id` (plus its own sort key) from public_echoes.
  cand_follow as (
    select e.id, 'follow'::text as source
      from public.follows f
      join public.visible_echoes e on e.author_id = f.following_id
     where f.follower_id = v_uid
       and e.check_content = true
       and e.author_id <> v_uid
     order by e.created_at desc
     limit 100
  ),
  cand_semantic as (
    select e.id, 'semantic'::text as source
      from public.visible_echoes e
     where v_taste is not null
       and e.check_content = true
       and e.embedding is not null
     order by e.embedding <=> v_taste
     limit 100
  ),
  cand_trending as (
    select mv.id, 'trending'::text as source
      from public.trending_echoes_mv mv
     order by mv.global_score desc
     limit v_cand_trend_limit
  ),
  cand_explore as (
    select el.id, 'exploration'::text as source
      from (
        select e.id, e.created_at
          from public.visible_echoes e
         where e.check_content = true
         order by e.created_at desc
         limit 500
      ) el
     order by md5(el.id::text || p_session_seed::text)
     limit v_cand_explore_limit
  ),
  candidates as (
    select c.id,
           (array_agg(c.source order by
              case c.source
                when 'follow'      then 1
                when 'semantic'    then 2
                when 'trending'    then 3
                else 4
              end))[1] as source
      from (
        select * from cand_follow    union all
        select * from cand_semantic  union all
        select * from cand_trending  union all
        select * from cand_explore
      ) c
     group by c.id
  ),
  scored as (
    -- The expensive exclusions run exactly once here, against the <=350+
    -- candidate ids rather than the whole table (C1).
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (
        coalesce(mv.global_score, public.feed_base_score(
            e.likes_count, e.comment_count, e.repost_count, e.view_count,
            e.created_at, e.media_urls is not null and array_length(e.media_urls, 1) > 0
          ))
        * (
            1
            + 0.6 * greatest(0, 1 - coalesce(e.embedding <=> v_taste, 1))
            + 0.5 * (case when exists (
                select 1 from public.follows f
                 where f.follower_id = v_uid and f.following_id = e.author_id
              ) then 1 else 0 end)
            + 0.4 * least(coalesce(aff.interactions, 0) / 5.0, 1)
          )
      )::double precision as rank_score,
      c.source
    from candidates c
    join public.visible_echoes e on e.id = c.id
    join public.profiles p on p.id = e.author_id
    left join public.trending_echoes_mv mv on mv.id = e.id
    -- M2: author_affinity now counts past likes AND comments the viewer made
    -- on this author's content, unioned before the count. Both legs still
    -- join back through public_echoes (le) to assert check_content = true on
    -- the echo being liked/commented on.
    left join lateral (
      select count(*)::float8 as interactions
        from (
          select l.echo_id from public.echo_likes l where l.user_id = v_uid
          union all
          select c2.echo_id from public.echo_comments c2 where c2.author_id = v_uid
        ) act
        join public.visible_echoes le on le.id = act.echo_id
       where le.author_id = e.author_id
         and le.check_content = true
    ) aff on true
    where e.check_content = true
      and e.author_id <> v_uid
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = v_uid and b.blocked_id = e.author_id)
      and not exists (select 1 from public.user_mutes m
                       where m.muter_id = v_uid and m.muted_id = e.author_id)
      and not exists (select 1 from public.user_not_interested ni
                       where ni.user_id = v_uid
                         and (ni.echo_id = e.id or ni.author_id = e.author_id))
      and not exists (select 1 from seen s where s.echo_id = e.id)
  )
  , primary_pick as (
    -- Over-fetch: return more than the page so the client-side selector in
    -- lib/feedSelection.ts has room to apply the author cap and the
    -- exploration reserve. Those rules live in TypeScript because they are
    -- unit-tested there; SQL only ranks.
    select s.*, 0 as tier from scored s
  ),
  -- Backfill: with a small corpus, seen-exclusion empties the feed within days.
  -- Re-surface seen echoes ranked below every unseen one, decayed by how
  -- recently they were seen. An empty feed is a worse failure than a repeat.
  -- Bounded to the same 90-day window as `seen` (I1) so the two tiers cannot
  -- both contain the same echo, and unbounded in row count (I2) so the outer
  -- cursor can page through it.
  backfill as (
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      (-1.0 / (1 + extract(epoch from (now() - v.created_at)) / 86400.0))::double precision as rank_score,
      'reseen'::text as source,
      1 as tier
    from public.echo_views v
    join public.visible_echoes e on e.id = v.echo_id
    join public.profiles p on p.id = e.author_id
    where v.user_id = v_uid
      and v.created_at > now() - interval '90 days'
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (select 1 from public.user_blocks b
                       where b.blocker_id = v_uid and b.blocked_id = e.author_id)
      and not exists (select 1 from public.user_mutes m
                       where m.muter_id = v_uid and m.muted_id = e.author_id)
      and not exists (select 1 from public.user_not_interested ni
                       where ni.user_id = v_uid
                         and (ni.echo_id = e.id or ni.author_id = e.author_id))
  ),
  merged as (
    select * from primary_pick
    union all
    select * from backfill
  )
  select m.id, m.author_id, m.title, m.prompt, m.response,
         m.likes_count, m.comment_count, m.repost_count, m.view_count,
         m.created_at, m.media_urls, m.quoted_echo_id,
         m.username, m.display_name, m.bio, m.avatar_color, m.avatar_url,
         m.is_verified, m.follower_count, m.rank_score, m.source
    from merged m
   where p_cursor_score is null
      or m.rank_score < p_cursor_score
      or (m.rank_score = p_cursor_score and m.id < p_cursor_id)
   order by m.rank_score desc, m.id desc
   limit p_limit * 3;
end;
$$;


ALTER FUNCTION "public"."get_personal_feed"("p_user_id" "uuid", "p_limit" integer, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_session_seed" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ranked_feed"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20, "p_gravity" double precision DEFAULT 1.8, "p_cursor_score" double precision DEFAULT NULL::double precision, "p_cursor_id" "uuid" DEFAULT NULL::"uuid", "p_following_only" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "author_id" "uuid", "title" "text", "prompt" "text", "response" "text", "likes_count" integer, "comment_count" integer, "repost_count" integer, "view_count" integer, "created_at" timestamp with time zone, "media_urls" "text"[], "quoted_echo_id" "uuid", "username" "text", "display_name" "text", "bio" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "follower_count" integer, "rank_score" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH candidates AS (
    -- Bound the work: rank within a candidate set rather than the whole table.
    -- Before this, every feed request scanned all of public_echoes and ran two
    -- window functions over it — 5,233 sequential scans reading 398,546 rows
    -- on a corpus of 84. Correct at that size, and quadratic-feeling at a
    -- hundred thousand. Both legs below are index-driven and bounded, which is
    -- the pattern get_personal_feed already uses.
    SELECT id FROM (
      SELECT e.id
        FROM public.visible_echoes e
       WHERE e.check_content = true
       ORDER BY e.created_at DESC
       LIMIT 500
    ) recent
    UNION
    SELECT id FROM (
      SELECT mv.id
        FROM public.trending_echoes_mv mv
       ORDER BY mv.global_score DESC
       LIMIT 300
    ) trending
  ),
  caller AS (
    SELECT CASE
             WHEN coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
               THEN p_user_id
             WHEN p_user_id IS NULL THEN NULL
             ELSE auth.uid()
           END AS uid
  ),
  eligible AS (
    SELECT
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.created_at, e.media_urls, e.quoted_echo_id,
      p.username, p.display_name, p.bio, p.avatar_color, p.avatar_url,
      p.is_verified, p.follower_count,
      COALESCE(mv.global_score, public.feed_base_score(
        e.likes_count, e.comment_count, e.repost_count, e.view_count,
        e.created_at, e.media_urls IS NOT NULL AND array_length(e.media_urls, 1) > 0
      )) AS base_score,
      c.uid AS viewer,
      EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = c.uid AND f.following_id = e.author_id
      ) AS follows_author
    FROM candidates cd
    JOIN public.visible_echoes e ON e.id = cd.id
    CROSS JOIN caller c
    JOIN public.profiles p ON p.id = e.author_id
    LEFT JOIN public.trending_echoes_mv mv ON mv.id = e.id
    WHERE
      e.check_content = true
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = c.uid AND b.blocked_id = e.author_id
      ))
      AND (c.uid IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.user_mutes m
        WHERE m.muter_id = c.uid AND m.muted_id = e.author_id
      ))
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
  ),
  ranked_within_author AS (
    -- Both ranks are computed over the author's own posts, never over the
    -- page, so they are identical on page 1 and page 5 and the keyset cursor
    -- stays correct. author_rank spreads the page; day_rank is the hard cap.
    SELECT eg.*,
           row_number() OVER (
             PARTITION BY eg.author_id
             ORDER BY eg.base_score DESC, eg.id DESC
           ) AS author_rank,
           row_number() OVER (
             PARTITION BY eg.author_id, date_trunc('day', eg.created_at)
             ORDER BY eg.base_score DESC, eg.id DESC
           ) AS day_rank
    FROM eligible eg
  ),
  scored AS (
    SELECT
      r.id, r.author_id, r.title, r.prompt, r.response,
      r.likes_count, r.comment_count, r.repost_count, r.view_count,
      r.created_at, r.media_urls, r.quoted_echo_id,
      r.username, r.display_name, r.bio, r.avatar_color, r.avatar_url,
      r.is_verified, r.follower_count, r.day_rank,
      (
        r.base_score
        * (1.0 + log(greatest(r.follower_count::float8 + 1.0, 1.0)) / 10.0)
        * CASE WHEN r.viewer IS NOT NULL AND r.follows_author THEN 1.5 ELSE 1.0 END
        -- Each further post by the same author counts 0.45 of the one before,
        -- to eight steps. Their best work still leads; their archive does not
        -- fill the page.
        * power(0.45::float8, least(r.author_rank - 1, 8)::float8)
      ) AS rank_score
    FROM ranked_within_author r
  )
  SELECT
    s.id, s.author_id, s.title, s.prompt, s.response,
    s.likes_count, s.comment_count, s.repost_count, s.view_count,
    s.created_at, s.media_urls, s.quoted_echo_id,
    s.username, s.display_name, s.bio, s.avatar_color, s.avatar_url,
    s.is_verified, s.follower_count, s.rank_score
  FROM scored s
  WHERE
    -- Three posts per author per day, lifted for the following-only feed where
    -- seeing one person's whole day is the point.
    (p_following_only OR s.day_rank <= 3)
    AND (
      p_cursor_score IS NULL
      OR s.rank_score < p_cursor_score
      OR (s.rank_score = p_cursor_score AND s.id < p_cursor_id)
    )
  ORDER BY s.rank_score DESC, s.id DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$$;


ALTER FUNCTION "public"."get_ranked_feed"("p_user_id" "uuid", "p_limit" integer, "p_gravity" double precision, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_following_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_remix_tree"("p_root_id" "uuid") RETURNS TABLE("id" "uuid", "parent_echo_id" "uuid", "depth" integer, "author_id" "uuid", "title" "text", "prompt" "text", "response" "text", "likes_count" integer, "comment_count" integer, "repost_count" integer, "remix_count" integer, "perspective_type" "text", "perspective_note" "text", "source_url" "text", "created_at" timestamp with time zone, "media_urls" "text"[], "username" "text", "display_name" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive lineage as (
    select e.*, 0 as depth
      from public.visible_echoes e
     where e.id = p_root_id
       and e.check_content = true
    union all
    select e.*, l.depth + 1
      from public.visible_echoes e
      join lineage l on e.parent_echo_id = l.id
     where l.depth < 8
       and e.check_content = true
  )
  select
    l.id, l.parent_echo_id, l.depth,
    l.author_id, l.title, l.prompt, l.response,
    l.likes_count, l.comment_count, l.repost_count, l.remix_count,
    case when l.parent_echo_id is null then null else coalesce(l.perspective_type, 'reframe') end,
    l.perspective_note,
    l.source_url,
    l.created_at, l.media_urls,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified
  from lineage l
  join public.profiles p on p.id = l.author_id
  order by l.depth asc,
           (l.likes_count + l.comment_count * 2 + l.repost_count * 2) desc,
           l.created_at desc
  limit 200;
$$;


ALTER FUNCTION "public"."get_remix_tree"("p_root_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_semantic_feed"("p_user_id" "uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "author_id" "uuid", "title" "text", "prompt" "text", "response" "text", "likes_count" integer, "comment_count" integer, "repost_count" integer, "view_count" integer, "remix_count" integer, "created_at" timestamp with time zone, "media_urls" "text"[], "quoted_echo_id" "uuid", "parent_echo_id" "uuid", "remix_root_id" "uuid", "username" "text", "display_name" "text", "bio" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "follower_count" integer, "distance" double precision)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  taste vector(768);
  v_uid uuid;
begin
  -- Identity comes from the JWT, never from the parameter. service_role has no
  -- auth.uid(), so it alone may name a user explicitly.
  v_uid := case
    when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      then coalesce(p_user_id, auth.uid())
    else auth.uid()
  end;

  if v_uid is null then
    return;
  end if;

  -- Average the embeddings of the user's recent likes (subquery to allow ORDER + LIMIT).
  select avg(recent_likes.embedding)::vector(768)
    into taste
    from (
      select e.embedding
      from public.echo_likes l
      join public.visible_echoes e on e.id = l.echo_id
      where l.user_id = v_uid
        and e.embedding is not null
        and e.check_content = true
      order by l.created_at desc
      limit 20
    ) recent_likes;

  -- Fall back to recent views / own publishes if no liked embeddings yet.
  if taste is null then
    select avg(recent_activity.embedding)::vector(768)
      into taste
      from (
        select e.embedding
        from (
          -- Qualify created_at with table alias to avoid clash with the
          -- plpgsql OUT variable of the same name (PG error 42702).
          select ev.echo_id, ev.created_at
          from public.echo_views ev
          where ev.user_id = v_uid

          union all

          select pe.id as echo_id, pe.created_at
          from public.visible_echoes pe
          where pe.author_id = v_uid
        ) src
        join public.visible_echoes e on e.id = src.echo_id
        where e.embedding is not null
          and e.check_content = true
        order by src.created_at desc
        limit 20
      ) recent_activity;
  end if;

  -- No signal at all -> degrade gracefully to engagement-ranked recent echoes.
  if taste is null then
    return query
      select
        e.id, e.author_id, e.title, e.prompt, e.response,
        e.likes_count, e.comment_count, e.repost_count, e.view_count,
        e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
        e.parent_echo_id, e.remix_root_id,
        p.username, p.display_name, p.bio,
        p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
        1.0::float8 as distance
      from public.visible_echoes e
      join public.profiles p on p.id = e.author_id
      where e.check_content = true
        and e.author_id <> v_uid
        and not exists (
          select 1 from public.user_blocks b
          where b.blocker_id = v_uid and b.blocked_id = e.author_id
        )
        and not exists (
          select 1 from public.user_mutes m
          where m.muter_id = v_uid and m.muted_id = e.author_id
        )
      order by (e.likes_count + e.comment_count * 2 + e.repost_count * 2) desc,
               e.created_at desc
      limit p_limit;
    return;
  end if;

  -- Main path: cosine-distance ranking against the taste vector.
  return query
    select
      e.id, e.author_id, e.title, e.prompt, e.response,
      e.likes_count, e.comment_count, e.repost_count, e.view_count,
      e.remix_count, e.created_at, e.media_urls, e.quoted_echo_id,
      e.parent_echo_id, e.remix_root_id,
      p.username, p.display_name, p.bio,
      p.avatar_color, p.avatar_url, p.is_verified, p.follower_count,
      (e.embedding <=> taste)::float8 as distance
    from public.visible_echoes e
    join public.profiles p on p.id = e.author_id
    where e.embedding is not null
      and e.check_content = true
      and e.author_id <> v_uid
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = v_uid and b.blocked_id = e.author_id
      )
      and not exists (
        select 1 from public.user_mutes m
        where m.muter_id = v_uid and m.muted_id = e.author_id
      )
    order by e.embedding <=> taste asc, e.created_at desc
    limit p_limit;
end;
$$;


ALTER FUNCTION "public"."get_semantic_feed"("p_user_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_similar_echoes"("p_echo_id" "uuid", "p_limit" integer DEFAULT 8) RETURNS TABLE("id" "uuid", "author_id" "uuid", "title" "text", "prompt" "text", "response" "text", "likes_count" integer, "comment_count" integer, "repost_count" integer, "view_count" integer, "remix_count" integer, "created_at" timestamp with time zone, "media_urls" "text"[], "parent_echo_id" "uuid", "remix_root_id" "uuid", "username" "text", "display_name" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "distance" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  WITH anchor AS (
    SELECT embedding FROM public.visible_echoes WHERE id = p_echo_id AND check_content = true
  )
  SELECT
    e.id, e.author_id, e.title, e.prompt, e.response,
    e.likes_count, e.comment_count, e.repost_count, e.view_count,
    e.remix_count, e.created_at, e.media_urls,
    e.parent_echo_id, e.remix_root_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    (e.embedding <=> (SELECT embedding FROM anchor))::float8 AS distance
  FROM public.visible_echoes e
  JOIN public.profiles p ON p.id = e.author_id
  WHERE e.id <> p_echo_id
    AND e.check_content = true
    AND e.embedding IS NOT NULL
    AND (SELECT embedding FROM anchor) IS NOT NULL
  ORDER BY e.embedding <=> (SELECT embedding FROM anchor) ASC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."get_similar_echoes"("p_echo_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_thinking_partners"("p_user_id" "uuid", "p_limit" integer DEFAULT 12, "p_mode" "text" DEFAULT 'similar'::"text") RETURNS TABLE("id" "uuid", "username" "text", "display_name" "text", "bio" "text", "avatar_color" "text", "avatar_url" "text", "is_verified" boolean, "follower_count" integer, "echo_count" integer, "affinity" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
    and not p.hidden_from_discovery
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


ALTER FUNCTION "public"."get_thinking_partners"("p_user_id" "uuid", "p_limit" integer, "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trending_evolutions"("p_limit" integer DEFAULT 20) RETURNS TABLE("root_id" "uuid", "root_title" "text", "root_prompt" "text", "root_response" "text", "root_created_at" timestamp with time zone, "root_media_urls" "text"[], "root_author_id" "uuid", "root_username" "text", "root_display_name" "text", "root_avatar_color" "text", "root_avatar_url" "text", "root_is_verified" boolean, "branch_count" integer, "agree_count" integer, "challenge_count" integer, "reframe_count" integer, "story_count" integer, "evidence_count" integer, "question_count" integer, "unique_authors" integer, "tree_engagement" bigint, "newest_remix_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with tree as (
    select
      coalesce(remix_root_id, id) as root_id,
      author_id,
      likes_count + comment_count * 2 + repost_count * 2 as eng,
      created_at,
      parent_echo_id,
      coalesce(perspective_type, 'reframe') as perspective_type
    from public.visible_echoes
    where check_content = true
  ),
  agg as (
    select
      root_id,
      count(*) filter (where parent_echo_id is not null) as branch_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'agree') as agree_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'challenge') as challenge_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'reframe') as reframe_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'story') as story_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'evidence') as evidence_count,
      count(*) filter (where parent_echo_id is not null and perspective_type = 'question') as question_count,
      count(distinct author_id) as unique_authors,
      sum(eng)::bigint as tree_engagement,
      max(case when parent_echo_id is not null then created_at end) as newest_remix_at
    from tree
    group by root_id
    having count(*) filter (where parent_echo_id is not null) >= 1
  )
  select
    a.root_id,
    r.title, r.prompt, r.response, r.created_at, r.media_urls, r.author_id,
    p.username, p.display_name, p.avatar_color, p.avatar_url, p.is_verified,
    a.branch_count::int,
    a.agree_count::int,
    a.challenge_count::int,
    a.reframe_count::int,
    a.story_count::int,
    a.evidence_count::int,
    a.question_count::int,
    a.unique_authors::int,
    a.tree_engagement,
    a.newest_remix_at
  from agg a
  join public.visible_echoes r on r.id = a.root_id and r.check_content = true
  join public.profiles p on p.id = r.author_id
  order by a.tree_engagement desc, a.newest_remix_at desc nulls last
  limit p_limit;
$$;


ALTER FUNCTION "public"."get_trending_evolutions"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_client_writes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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
        when (new.title, new.prompt, new.response, new.media_urls, new.media_alt)
             is distinct from (old.title, old.prompt, old.response, old.media_urls, old.media_alt)
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


ALTER FUNCTION "public"."guard_client_writes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_listing_moderation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.check_content := false;
      new.moderated_at  := null;
    end if;
    new.content_version := 1;
    return new;
  end if;

  if (new.title, new.description, new.photo_urls, new.tags)
     is distinct from (old.title, old.description, old.photo_urls, old.tags) then
    -- New content has no verdict, whoever wrote it.
    new.content_version := old.content_version + 1;
    new.check_content   := false;
    new.moderated_at    := null;
  else
    new.content_version := old.content_version;
    if current_user in ('anon', 'authenticated') then
      new.check_content := old.check_content;
      new.moderated_at  := old.moderated_at;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_listing_moderation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_media_provenance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_url text;
begin
  -- Rejected, not silently corrected. guard_client_writes corrects columns the
  -- server owns because an honest client never writes them; here the client is
  -- supposed to supply the value, so a bad one is a mistake the caller needs
  -- told about rather than a forged field to quietly drop.
  --
  -- `is distinct from` rather than `<>` so a NULL on either side compares
  -- correctly: media_urls is nullable, and `null <> null` would be null, which
  -- would skip validation on an insert that sets it.
  if tg_op = 'INSERT' or new.media_urls is distinct from old.media_urls then
    if new.media_urls is not null then
      foreach v_url in array new.media_urls loop
        if not public.media_url_allowed(v_url) then
          raise exception
            'media_urls must point at an allowed Echo media host (got %). Upload through the media worker, or add the host to public.media_url_hosts.', v_url
            using errcode = '42501';
        end if;
      end loop;
    end if;
  end if;

  if tg_op = 'INSERT' or new.hls_url is distinct from old.hls_url then
    if not public.media_url_allowed(new.hls_url) then
      raise exception
        'hls_url must point at an allowed Echo media host (got %).', new.hls_url
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_media_provenance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."habit_stats"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("habit_client_id" "text", "entries" integer, "last_date" "date", "current_streak" integer, "completion_30d" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with days as (
    select e.habit_client_id, e.date
    from public.habit_entry e
    where e.user_id = p_user
  ),
  streaks as (
    select
      habit_client_id,
      date,
      date - (row_number() over (partition by habit_client_id order by date))::int as grp
    from days
  ),
  runs as (
    select habit_client_id, grp, count(*) as len, max(date) as run_end
    from streaks
    group by habit_client_id, grp
  )
  select
    d.habit_client_id,
    count(*)::int as entries,
    max(d.date) as last_date,
    coalesce((
      select r.len::int from runs r
      where r.habit_client_id = d.habit_client_id
        and r.run_end >= current_date - 1
      order by r.run_end desc limit 1
    ), 0) as current_streak,
    count(*) filter (where d.date > current_date - 30)::int as completion_30d
  from days d
  group by d.habit_client_id;
$$;


ALTER FUNCTION "public"."habit_stats"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  v_username text;
  v_display  text;
  v_candidate text;
  v_n int := 0;
begin
  -- Trim and treat '' as absent: a provider sending an empty string is not
  -- supplying a name, and '' would fail the NOT NULL check just as null does.
  v_username := nullif(btrim(coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  )), '');

  v_display := nullif(btrim(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    v_username,
    ''
  )), '');

  v_username := coalesce(v_username, v_fallback);
  v_display  := coalesce(v_display,  v_username);

  -- Settle a collision on the UNIQUE index rather than letting it abort signup.
  v_candidate := v_username;
  while exists (select 1 from public.profiles p where p.username = v_candidate) loop
    v_n := v_n + 1;
    if v_n > 50 then
      v_candidate := v_fallback || '_' || substr(md5(random()::text), 1, 6);
      exit;
    end if;
    v_candidate := v_username || '_' || v_n::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_candidate, v_display)
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_new_user"() IS 'Creates the profile row for a new auth.users record. Every fallback terminates in a value derived from new.id, because both target columns are NOT NULL and a raise here aborts the signup.';



CREATE OR REPLACE FUNCTION "public"."handle_remix_lineage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent_root uuid;
begin
  if new.parent_echo_id is not null and new.remix_root_id is null then
    select coalesce(remix_root_id, id) into parent_root
      from public.public_echoes
      where id = new.parent_echo_id;
    new.remix_root_id := parent_root;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_remix_lineage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hold_moderated_content"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.check_content is true
     and old.check_content is distinct from true
     and public.echo_is_held(new.id) then
    new.check_content := false;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."hold_moderated_content"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_ad_click"("ad_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.record_ad_event(ad_id, 'click') then
    update public.ads set clicks = clicks + 1 where id = ad_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."increment_ad_click"("ad_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_ad_view"("ad_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- A non-existent ad_id is now rejected by the ad_events foreign key instead
  -- of silently updating zero rows.
  if public.record_ad_event(ad_id, 'view') then
    update public.ads set views = views + 1 where id = ad_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."increment_ad_view"("ad_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ingest_revenuecat_event"("p_event" "jsonb", "p_users" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.subscription_webhook_events (event_id, event_type, app_user_id, event_timestamp, payload)
  values (
    p_event->>'id',
    coalesce(p_event->>'type', 'UNKNOWN'),
    coalesce(p_event->>'app_user_id', ''),
    coalesce((p_event->>'event_timestamp_ms')::bigint, 0),
    p_event - 'subscriber_attributes'
  )
  on conflict (event_id) do nothing;
  if not found then
    return;
  end if;
  perform public.jobs_enqueue('entitlements', jsonb_build_object('user_id', u))
    from unnest(coalesce(p_users, '{}')) as u;
end;
$$;


ALTER FUNCTION "public"."ingest_revenuecat_event"("p_event" "jsonb", "p_users" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_adult"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(public.user_age_years(p_uid) >= public.adult_age_years(), false);
$$;


ALTER FUNCTION "public"."is_adult"("p_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_adult"("p_uid" "uuid") IS 'True only when a date of birth is on file AND the user is 18 or older. Unknown age is treated as NOT adult, so an account that predates the age gate is handled as a minor until it supplies a date of birth.';



CREATE OR REPLACE FUNCTION "public"."is_dm_conversation_member"("p_conversation_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
      from public.dm_conversations c
     where c.id = p_conversation_id
       and (
         (coalesce(c.is_group, false) = false and (c.user_a = p_user_id or c.user_b = p_user_id))
         or
         (coalesce(c.is_group, false) = true and exists (
            select 1
              from public.dm_conversation_members m
             where m.conversation_id = c.id
               and m.user_id = p_user_id
          ))
       )
  );
$$;


ALTER FUNCTION "public"."is_dm_conversation_member"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_queue_health"() RETURNS TABLE("queue_name" "text", "depth" bigint, "oldest_enqueued_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_queue text;
begin
  for v_queue in select m.queue_name from pgmq.meta m order by m.queue_name loop
    return query execute format(
      'select %L::text, count(*)::bigint, min(enqueued_at) from pgmq.%I',
      v_queue, pgmq.format_table_name(v_queue, 'q')
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."job_queue_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_ack"("p_queue" "text", "p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform pgmq.delete(p_queue, p_id);
end;
$$;


ALTER FUNCTION "public"."jobs_ack"("p_queue" "text", "p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_claim"("p_queue" "text", "p_n" integer, "p_vt" integer) RETURNS SETOF "pgmq"."message_record"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select * from pgmq.read(p_queue, p_vt, p_n);
$$;


ALTER FUNCTION "public"."jobs_claim"("p_queue" "text", "p_n" integer, "p_vt" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_dead"("p_queue" "text", "p_id" bigint, "p_msg" "jsonb", "p_error" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', p_queue, 'kind', 'failed', 'msg', p_msg, 'error', left(p_error, 2000), 'at', now()));
  perform pgmq.archive(p_queue, p_id);
end;
$$;


ALTER FUNCTION "public"."jobs_dead"("p_queue" "text", "p_id" bigint, "p_msg" "jsonb", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_enqueue"("p_queue" "text", "p_msg" "jsonb", "p_delay" integer DEFAULT 0) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id bigint;
begin
  select * into v_id from pgmq.send(p_queue, p_msg, p_delay);
  if p_delay = 0 then
    perform public.jobs_kick(p_queue);
  end if;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."jobs_enqueue"("p_queue" "text", "p_msg" "jsonb", "p_delay" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_health"() RETURNS TABLE("problem" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_queue text;
  v_waiting bigint;
begin
  select count(*) into v_waiting from pgmq.q_dlq;
  if v_waiting > 0 then
    problem := v_waiting || ' job(s) in the dead-letter queue'; return next;
  end if;
  for v_queue in select queue_name from pgmq.meta where queue_name <> 'dlq' loop
    execute format('select count(*) from pgmq.%I where vt <= clock_timestamp() - interval ''15 minutes''',
                   pgmq.format_table_name(v_queue, 'q'))
      into v_waiting;
    if v_waiting > 0 then
      problem := v_queue || ': ' || v_waiting || ' job(s) unclaimed for 15 minutes'; return next;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."jobs_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_kick"("p_queue" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body    := jsonb_build_object('queue', p_queue)
  );
exception when others then
  raise warning 'jobs_kick(%) failed: %', p_queue, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."jobs_kick"("p_queue" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_report"("p_queue" "text", "p_msg" "jsonb", "p_error" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', p_queue, 'kind', 'report', 'msg', p_msg, 'error', left(p_error, 2000), 'at', now()));
end;
$$;


ALTER FUNCTION "public"."jobs_report"("p_queue" "text", "p_msg" "jsonb", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_retry"("p_queue" "text", "p_id" bigint, "p_delay" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform pgmq.set_vt(p_queue, p_id, greatest(p_delay, 1));
end;
$$;


ALTER FUNCTION "public"."jobs_retry"("p_queue" "text", "p_id" bigint, "p_delay" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_sweep"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_queue text;
  v_ready boolean;
begin
  for v_queue in select queue_name from pgmq.meta where queue_name <> 'dlq' loop
    execute format('select exists (select 1 from pgmq.%I where vt <= clock_timestamp())',
                   pgmq.format_table_name(v_queue, 'q'))
      into v_ready;
    if v_ready then
      perform public.jobs_kick(v_queue);
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."jobs_sweep"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."keep_device_revoked"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked device stays revoked' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."keep_device_revoked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_group"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_was_admin boolean;
begin
  select role = 'admin' into v_was_admin
    from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = v_uid;

  delete from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = v_uid;

  -- If the last admin left, hand the crown to the earliest remaining member.
  if coalesce(v_was_admin, false) and not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and role = 'admin'
  ) then
    update public.dm_conversation_members
       set role = 'admin'
     where conversation_id = p_conversation_id
       and user_id = (
         select user_id from public.dm_conversation_members
          where conversation_id = p_conversation_id
          order by joined_at asc limit 1
       );
  end if;
end;
$$;


ALTER FUNCTION "public"."leave_group"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_read"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.direct_messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id != auth.uid()
     and read_at is null
     and public.is_dm_conversation_member(p_conversation_id, auth.uid());
$$;


ALTER FUNCTION "public"."mark_messages_read"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_url_allowed"("p_url" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- https only. This also rejects javascript:, data:, file: and plain http,
  -- and a credentials-in-URL form (user:pass@host) fails to match the
  -- allowlist because the captured authority still carries the userinfo.
  select p_url is null
      or exists (
        select 1 from public.media_url_hosts h
        where h.host = substring(p_url from '^https://([^/?#]+)')
      );
$$;


ALTER FUNCTION "public"."media_url_allowed"("p_url" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."media_url_allowed"("p_url" "text") IS 'Whether a media URL points at an allowed Echo-controlled host. Null is allowed so the column stays optional.';



CREATE OR REPLACE FUNCTION "public"."minimum_age_years"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$ select 18 $$;


ALTER FUNCTION "public"."minimum_age_years"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_avatar"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.avatar_url is null or new.avatar_url = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  perform public.jobs_enqueue('media_moderation', jsonb_build_object(
    'kind', 'avatar', 'id', new.id, 'url', new.avatar_url));
  return new;
end;
$$;


ALTER FUNCTION "public"."moderate_avatar"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_listing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.check_content is true or new.status = 'removed' then
    return new;
  end if;
  perform public.jobs_enqueue('media_moderation', jsonb_build_object(
    'kind', 'listing', 'id', new.id, 'content_version', new.content_version));
  return new;
end;
$$;


ALTER FUNCTION "public"."moderate_listing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_new_echo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.check_content is true then
    return new;
  end if;
  perform public.jobs_enqueue('moderation', jsonb_build_object('echo_id', new.id));
  return new;
end;
$$;


ALTER FUNCTION "public"."moderate_new_echo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderator_remove_echo"("p_echo_id" "uuid", "p_ground" "text", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author   uuid;
  v_decision uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_moderator = true) then
    raise exception 'not_a_moderator' using errcode = '42501';
  end if;
  if p_ground is null or length(trim(p_ground)) = 0 then
    raise exception 'ground_required' using errcode = 'P0001';
  end if;

  select author_id into v_author from public.public_echoes where id = p_echo_id;
  if v_author is null then
    raise exception 'echo_not_found' using errcode = 'P0001';
  end if;

  -- Reversible hide: the feed/thread queries gate on check_content = true.
  update public.public_echoes set check_content = false where id = p_echo_id;

  insert into public.moderation_decisions (subject_id, echo_id, decision_type, ground, reason, automated)
  values (v_author, p_echo_id, 'content_removed', p_ground, coalesce(nullif(trim(p_reason), ''), p_ground), false)
  returning id into v_decision;

  -- Art. 17: inform the author, with a link to the decision (and thus to appeal).
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (
    v_author, 'content_removed', null, 'moderation_decision', v_decision,
    'Your content was removed. Tap to see the reasons and appeal.'
  );

  return v_decision;
end;
$$;


ALTER FUNCTION "public"."moderator_remove_echo"("p_echo_id" "uuid", "p_ground" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_appeal_resolved"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF new.status <> 'pending' AND old.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_kind, target_id)
    SELECT
      new.appellant_id,
      'appeal_resolved',
      NULL,
      'appeal',
      new.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'appeal_resolved' AND target_id = new.id
    );
  END IF;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."notify_on_appeal_resolved"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id
    from public.public_echoes where id = new.echo_id;

  if v_author_id is not null and v_author_id <> new.author_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    values (v_author_id, 'comment', new.author_id, 'echo', new.echo_id,
            left(new.content, 120))
    on conflict do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_comment_mention"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."notify_on_comment_mention"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_echo_bookmark"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.public_echoes where id = new.echo_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
  values (v_author, 'bookmark', new.user_id, 'echo', new.echo_id);
  return new;
exception when others then
  return new;
end $$;


ALTER FUNCTION "public"."notify_on_echo_bookmark"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_echo_like"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id
    from public.public_echoes where id = new.echo_id;

  -- Don't notify self-likes
  if v_author_id is not null and v_author_id <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (v_author_id, 'like', new.user_id, 'echo', new.echo_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_echo_like"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_echo_mention"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_actor uuid;
begin
  select author_id into v_actor from public.public_echoes where id = new.echo_id;
  if v_actor is not null and v_actor <> new.mentioned_user_id then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id)
    values (new.mentioned_user_id, 'mention', v_actor, 'echo', new.echo_id)
    on conflict do nothing;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."notify_on_echo_mention"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_echo_quote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author uuid;
begin
  if new.quoted_echo_id is null then return new; end if;
  select author_id into v_author from public.public_echoes where id = new.quoted_echo_id;
  if v_author is null or v_author = new.author_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (v_author, 'quote', new.author_id, 'echo', new.id, left(new.prompt, 140));
  return new;
exception when others then
  return new;
end $$;


ALTER FUNCTION "public"."notify_on_echo_quote"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_echo_reaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_author uuid;
begin
  select author_id into v_author from public.public_echoes where id = new.echo_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
  values (v_author, 'reaction', new.user_id, 'echo', new.echo_id, new.reaction);
  return new;
exception when others then
  return new;
end $$;


ALTER FUNCTION "public"."notify_on_echo_reaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_follow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if current_setting('echo.approving_follow', true) = '1' then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id)
  on conflict do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_on_follow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_reporter_on_resolution"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status in ('resolved', 'dismissed')
     and old.status not in ('resolved', 'dismissed')
  then
    insert into public.notifications (user_id, type, actor_id, target_kind, target_id, preview)
    values (
      new.reporter_id,
      'report_resolved',
      null,
      'report',
      new.id,
      case new.status
        when 'resolved'  then 'Your report has been reviewed — action was taken.'
        when 'dismissed' then 'Your report was reviewed. No action was required.'
      end
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_reporter_on_resolution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ping_presence"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid();
$$;


ALTER FUNCTION "public"."ping_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_operational_logs"() RETURNS TABLE("what" "text", "removed" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $$
declare
  v_count bigint;
  v_queue text;
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics v_count = row_count;
  what := 'cron.job_run_details'; removed := v_count; return next;

  delete from net._http_response where created < now() - interval '6 hours';
  get diagnostics v_count = row_count;
  what := 'net._http_response'; removed := v_count; return next;

  delete from public.probe_runs where ran_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  what := 'probe_runs'; removed := v_count; return next;

  delete from public.echo_views where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  what := 'echo_views'; removed := v_count; return next;

  delete from public.notifications
   where created_at < now() - interval '90 days'
     and (read_at is not null or dismissed_at is not null);
  get diagnostics v_count = row_count;
  what := 'notifications'; removed := v_count; return next;

  delete from public.subscription_webhook_events where received_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  what := 'subscription_webhook_events'; removed := v_count; return next;

  delete from public.ad_events where day < current_date - 180;
  get diagnostics v_count = row_count;
  what := 'ad_events'; removed := v_count; return next;

  update public.ai_tool_calls
     set status = 'failed', error = 'expired: not confirmed within a day'
   where status = 'pending_confirm'
     and created_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  what := 'ai_tool_calls expired'; removed := v_count; return next;

  -- Archived jobs. The live dlq queue is never purged here: it is the alarm,
  -- and is cleared by whoever reads it (docs/runbook/monitoring.md).
  for v_queue in select queue_name from pgmq.meta loop
    execute format('delete from pgmq.%I where archived_at < now() - interval ''14 days''',
                   pgmq.format_table_name(v_queue, 'a'));
    get diagnostics v_count = row_count;
    what := 'pgmq archive ' || v_queue; removed := v_count; return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."purge_operational_logs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."purge_operational_logs"() IS 'Daily retention for rows nothing reads any more. Returns what it removed, so a run can be inspected.';



CREATE OR REPLACE FUNCTION "public"."rank_breakdowns"("p_uids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "post_pts" integer, "coauthor_pts" integer, "comments_received_pts" integer, "reposts_received_pts" integer, "likes_received_pts" integer, "comments_made_pts" integer, "last_active_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with posts as (
    select e.id, e.author_id, e.co_author_id, e.created_at
      from public.public_echoes e
     where e.check_content
  ),
  post_pts as (
    select author_id as uid, sum(least(n, 3))::int * 10 as pts
      from (select author_id, (created_at at time zone 'utc')::date, count(*) as n
              from posts
             where p_uids is null or author_id = any (p_uids)
             group by 1, 2) d
     group by 1
  ),
  coauthor_pts as (
    select co_author_id as uid, count(*)::int * 10 as pts
      from posts
     where co_author_id is not null
       and co_author_id <> author_id
       and (p_uids is null or co_author_id = any (p_uids))
     group by 1
  ),
  comments_received as (
    select p.author_id as uid, count(distinct (c.echo_id, c.author_id))::int * 3 as pts
      from public.echo_comments c
      join posts p on p.id = c.echo_id
     where c.author_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  reposts_received as (
    select p.author_id as uid, count(distinct (r.echo_id, r.user_id))::int * 4 as pts
      from public.echo_reposts r
      join posts p on p.id = r.echo_id
     where r.user_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  likes_received as (
    select p.author_id as uid, count(distinct (l.echo_id, l.user_id))::int * 1 as pts
      from public.echo_likes l
      join posts p on p.id = l.echo_id
     where l.user_id <> p.author_id
       and (p_uids is null or p.author_id = any (p_uids))
     group by 1
  ),
  comments_made as (
    select uid, sum(least(n, 10))::int * 2 as pts
      from (select c.author_id as uid, (c.created_at at time zone 'utc')::date, count(*) as n
              from public.echo_comments c
              join posts p on p.id = c.echo_id
             where c.author_id <> p.author_id
               and (p_uids is null or c.author_id = any (p_uids))
             group by 1, 2) d
     group by 1
  ),
  activity as (
    select uid, max(at) as last_active_at from (
      select author_id as uid, created_at as at from public.public_echoes
       where p_uids is null or author_id = any (p_uids)
      union all
      select author_id, created_at from public.echo_comments
       where p_uids is null or author_id = any (p_uids)
    ) a
    group by 1
  ),
  people as (
    select uid from post_pts union select uid from coauthor_pts
    union select uid from comments_received union select uid from reposts_received
    union select uid from likes_received union select uid from comments_made
    union select uid from activity
  )
  select pe.uid,
         coalesce(pp.pts, 0), coalesce(ca.pts, 0), coalesce(cr.pts, 0),
         coalesce(rr.pts, 0), coalesce(lr.pts, 0), coalesce(cm.pts, 0),
         ac.last_active_at
    from people pe
    left join post_pts pp          on pp.uid = pe.uid
    left join coauthor_pts ca      on ca.uid = pe.uid
    left join comments_received cr on cr.uid = pe.uid
    left join reposts_received rr  on rr.uid = pe.uid
    left join likes_received lr    on lr.uid = pe.uid
    left join comments_made cm     on cm.uid = pe.uid
    left join activity ac          on ac.uid = pe.uid;
$$;


ALTER FUNCTION "public"."rank_breakdowns"("p_uids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rank_tier_for"("p_points" integer) RETURNS smallint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select (case
    when p_points >= 2000 then 5
    when p_points >= 750  then 4
    when p_points >= 250  then 3
    when p_points >= 75   then 2
    when p_points >= 10   then 1
    else 0
  end)::smallint;
$$;


ALTER FUNCTION "public"."rank_tier_for"("p_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ad_event"("p_ad_id" "uuid", "p_kind" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- ON CONFLICT DO NOTHING makes the repeat case cheap and race-free: two
  -- concurrent taps cannot both see "no row yet" and both increment.
  insert into public.ad_events (ad_id, user_id, kind)
  values (p_ad_id, v_uid, p_kind)
  on conflict do nothing;

  -- ROW_COUNT is an integer: 1 when the insert created a row, 0 on conflict.
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;


ALTER FUNCTION "public"."record_ad_event"("p_ad_id" "uuid", "p_kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_ranks"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  changed integer;
begin
  with b as (
    select user_id,
           (post_pts + coauthor_pts + comments_received_pts + reposts_received_pts
             + likes_received_pts + comments_made_pts) as points,
           last_active_at
      from public.rank_breakdowns(null)
  )
  update public.profiles pr
     set rank_points    = coalesce(b.points, 0),
         rank_tier      = public.rank_tier_for(coalesce(b.points, 0)),
         -- A private account's recent activity is not shown to people it has
         -- not approved, so it never gets the "active this week" marker. Its
         -- tier is an aggregate and does show, like its follower count.
         rank_active_at = case when p.is_private then null else b.last_active_at end
    from public.profiles p
    left join b on b.user_id = p.id
   where pr.id = p.id
     -- Only rows that moved, so an idle hour writes nothing.
     and (pr.rank_points    is distinct from coalesce(b.points, 0)
       or pr.rank_active_at is distinct from (case when p.is_private then null else b.last_active_at end));
  get diagnostics changed = row_count;
  return changed;
end;
$$;


ALTER FUNCTION "public"."refresh_ranks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_user_taste"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_taste  extensions.vector(768);
  v_source text;
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  then
    raise exception 'refresh_user_taste: not authorized for another user';
  end if;

  -- What someone liked is the strongest evidence of what they want to read.
  select avg(src.embedding)::extensions.vector(768)
    into v_taste
    from (
      select e.embedding
        from public.echo_likes l
        join public.public_echoes e on e.id = l.echo_id
       where l.user_id = p_user_id
         and e.embedding is not null
         and e.check_content = true
       order by l.created_at desc
       limit 20
    ) src;

  if v_taste is not null then
    v_source := 'likes';
  else
    -- Nothing liked yet. Fall back to what they said they were interested in:
    -- the average of those labels' own vectors. A stated interest is weaker
    -- evidence than a like, which is why it is only ever the fallback, and it
    -- is replaced the moment a like exists.
    select avg(ie.embedding)::extensions.vector(768)
      into v_taste
      from public.user_interests ui
      join public.interest_embeddings ie on ie.interest = ui.interest
     where ui.user_id = p_user_id;

    if v_taste is not null then
      v_source := 'interests';
    else
      -- Never liked anything and never stated an interest. Read their own
      -- posts instead of giving up: the alternative is a null vector, and a
      -- null vector is not neutral — it zeroes the term outright.
      --
      -- Same filters as the likes branch, for the same reasons: an unembedded
      -- post contributes nothing to an average, and one that failed moderation
      -- should not steer a feed. Bounded at 20 so a prolific author costs the
      -- same as anyone else, and ordered newest-first so the vector tracks what
      -- they write about now rather than what they wrote about first.
      select avg(src.embedding)::extensions.vector(768)
        into v_taste
        from (
          select e.embedding
            from public.public_echoes e
           where e.author_id = p_user_id
             and e.embedding is not null
             and e.check_content = true
           order by e.created_at desc
           limit 20
        ) src;

      if v_taste is not null then v_source := 'authored'; end if;
    end if;
  end if;

  insert into public.user_taste (user_id, taste_vector, updated_at, seeded_from)
  values (p_user_id, v_taste, now(), v_source)
  on conflict (user_id) do update
    set taste_vector = excluded.taste_vector,
        updated_at   = excluded.updated_at,
        seeded_from  = excluded.seeded_from;
end;
$$;


ALTER FUNCTION "public"."refresh_user_taste"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_follow_requests"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
begin
  for r in select requester_id from public.follow_requests where target_id = new.id loop
    begin
      perform public.approve_follow(r.requester_id, new.id);
    exception when others then
      continue;
    end;
  end loop;
  delete from public.follow_requests where target_id = new.id;
  delete from public.notifications where user_id = new.id and type = 'follow_request';
  return new;
end;
$$;


ALTER FUNCTION "public"."release_follow_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_group_admin(p_conversation_id);
  if p_user_id = auth.uid() then
    raise exception 'use leave_group to remove yourself';
  end if;
  delete from public.dm_conversation_members
   where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_reason_is_urgent"("p_reason" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select p_reason in (
    'Sexual content or nudity',
    'Intimate images of me shared without consent',
    'Child sexual abuse or exploitation',
    'Impersonation'
  );
$$;


ALTER FUNCTION "public"."report_reason_is_urgent"("p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_erasure"("p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.erasure_requests (user_id) values (p_user)
  on conflict (user_id) do nothing;
  -- A repeat request for an erasure still in progress queues another run;
  -- runs are idempotent, so the extra one only finishes sooner.
  if exists (select 1 from public.erasure_requests where user_id = p_user and state <> 'done') then
    perform public.jobs_enqueue('erasure', jsonb_build_object('user_id', p_user));
  end if;
end;
$$;


ALTER FUNCTION "public"."request_erasure"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_follow"("p_target" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_private boolean;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  if p_target is null or p_target = v_uid then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  select p.is_private into v_private from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no_such_user' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_target) then
    return 'following';
  end if;

  if not coalesce(v_private, false) then
    insert into public.follows (follower_id, following_id) values (v_uid, p_target)
    on conflict do nothing;
    return 'following';
  end if;

  if exists (select 1 from public.user_blocks b where b.blocker_id = p_target and b.blocked_id = v_uid) then
    return 'requested';
  end if;

  insert into public.follow_requests (requester_id, target_id) values (v_uid, p_target)
  on conflict do nothing;
  if found then
    insert into public.notifications (user_id, type, actor_id)
    values (p_target, 'follow_request', v_uid)
    on conflict do nothing;
  end if;
  return 'requested';
end;
$$;


ALTER FUNCTION "public"."request_follow"("p_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_follow_request"("p_requester" "uuid", "p_accept" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  delete from public.follow_requests where requester_id = p_requester and target_id = v_uid;
  if not found then
    return false;
  end if;
  delete from public.notifications
   where user_id = v_uid and type = 'follow_request' and actor_id = p_requester;

  if p_accept then
    perform public.approve_follow(p_requester, v_uid);
  end if;
  return true;
end;
$$;


ALTER FUNCTION "public"."respond_follow_request"("p_requester" "uuid", "p_accept" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_content_on_overturned_appeal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'overturned' and old.status = 'pending' and new.decision_id is not null then
    update public.public_echoes pe
      set check_content = true
      from public.moderation_decisions md
     where md.id = new.decision_id
       and pe.id = md.echo_id
       and md.decision_type = 'content_removed';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."restore_content_on_overturned_appeal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_on_dismissed_urgent_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.auto_hidden and new.status = 'dismissed' and old.status is distinct from 'dismissed'
     and new.target_type = 'echo' then
    -- The hold trigger still applies: another open urgent report or a removal
    -- decision keeps the echo hidden.
    update public.public_echoes set check_content = true where id = new.target_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."restore_on_dismissed_urgent_report"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scrub_deleted_dm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;
  if new.deleted_at is null then
    return new;
  end if;

  -- All four sealed columns together, or direct_messages_encryption_coherent
  -- rejects the row.
  new.text                 := null;
  new.ciphertext           := null;
  new.nonce                := null;
  new.ephemeral_public_key := null;
  new.enc_version          := null;
  new.media_url            := null;
  new.voice_url            := null;
  new.link_preview         := null;
  new.shared_echo_id       := null;

  if old.deleted_at is null then
    if coalesce(old.media_url, old.voice_url) is not null then
      perform public.jobs_enqueue('media_gc', jsonb_build_object(
        'bucket', 'dm-media',
        'sender_id', old.sender_id,
        'values', jsonb_strip_nulls(jsonb_build_object('media', old.media_url, 'voice', old.voice_url))));
    end if;
    delete from public.direct_message_keys where message_id = new.id;

    update public.dm_conversations
       set last_message_text = null
     where id = new.conversation_id
       and last_message_at = old.created_at;

    -- fn_dm_push_notify copied up to 140 characters of plaintext into the
    -- recipient's notification. Its target is the conversation, not the
    -- message, so match on sender, conversation, text and time.
    update public.notifications
       set preview = null
     where type = 'dm'
       and actor_id = old.sender_id
       and target_id = old.conversation_id
       and preview is not null
       and preview = left(coalesce(old.text, ''), 140)
       and created_at between old.created_at - interval '1 minute' and old.created_at + interval '1 minute';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."scrub_deleted_dm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_due_rules_reminders"("p_limit" integer DEFAULT 2000) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sent integer;
begin
  with due as (
    select p.id
      from public.profiles p
      left join public.rules_notices r on r.user_id = p.id
     where coalesce(r.last_notified_at, p.created_at) <= now() - interval '90 days'
     order by coalesce(r.last_notified_at, p.created_at)
     limit greatest(p_limit, 0)
  ),
  sent as (
    insert into public.notifications (user_id, type)
    select id, 'rules_reminder' from due
    returning user_id
  ),
  recorded as (
    insert into public.rules_notices (user_id, last_notified_at)
    select user_id, now() from sent
    on conflict (user_id) do update set last_notified_at = excluded.last_notified_at
    returning 1
  )
  select count(*) into v_sent from recorded;
  return v_sent;
end;
$$;


ALTER FUNCTION "public"."send_due_rules_reminders"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."send_due_rules_reminders"("p_limit" integer) IS 'Notify every user not reminded of the rules in 90 days. Daily cron; batch-limited so a backlog spreads over days.';



CREATE OR REPLACE FUNCTION "public"."send_encrypted_dm"("p_message" "jsonb", "p_keys" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_conversation uuid := (p_message->>'conversation_id')::uuid;
begin
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) = 0 then
    raise exception 'an encrypted message needs at least one key' using errcode = '22023';
  end if;
  if exists (select 1 from public.dm_conversations c where c.id = v_conversation and c.is_group) then
    raise exception 'group conversations are not end-to-end encrypted' using errcode = '22023';
  end if;

  insert into public.direct_messages (
    id, conversation_id, sender_id, kind, text,
    ciphertext, nonce, ephemeral_public_key, enc_version,
    shared_echo_id, reply_to_id
  ) values (
    (p_message->>'id')::uuid,
    v_conversation,
    (select auth.uid()),
    p_message->>'kind',
    null,
    p_message->>'ciphertext',
    p_message->>'nonce',
    p_message->>'ephemeral_public_key',
    1,
    nullif(p_message->>'shared_echo_id', '')::uuid,
    nullif(p_message->>'reply_to_id', '')::uuid
  )
  returning id into v_id;

  insert into public.direct_message_keys (message_id, device_id, wrapped_key, nonce)
  select v_id, (k->>'device_id')::uuid, k->>'wrapped_key', k->>'nonce'
    from jsonb_array_elements(p_keys) as k;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."send_encrypted_dm"("p_message" "jsonb", "p_keys" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_heartbeat"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_url text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'heartbeat_url';
  if v_url is null then
    return;
  end if;
  if (select unhealthy from public.cron_health()) = 0 then
    perform net.http_get(url := v_url);
  end if;
end;
$$;


ALTER FUNCTION "public"."send_heartbeat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_group_member_role"("p_conversation_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_group_admin(p_conversation_id);
  if p_role not in ('admin', 'member') then
    raise exception 'invalid role';
  end if;
  update public.dm_conversation_members
     set role = p_role
   where conversation_id = p_conversation_id and user_id = p_user_id;
  -- Never leave a group without an admin.
  if not exists (
    select 1 from public.dm_conversation_members
     where conversation_id = p_conversation_id and role = 'admin'
  ) then
    raise exception 'a group needs at least one admin';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_group_member_role"("p_conversation_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_marketplace_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_marketplace_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_ad_payment"("p_event_id" "text", "p_payload" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_pay jsonb := p_payload #> '{payload,payment,entity}';
  v_order text := p_payload #>> '{payload,payment,entity,order_id}';
  v_ad uuid;
begin
  if v_order is null then
    return 'ignored';
  end if;

  insert into public.payment_events (event_id, event_type, payload)
  values (p_event_id, p_payload->>'event', p_payload)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  update public.ads
     set payment_status = 'paid',
         is_active      = true
   where razorpay_order_id = v_order
     and payment_status = 'pending'
     and round(budget_amount * 100) = (v_pay->>'amount')::numeric
     and upper(v_pay->>'currency') = 'INR'
  returning id into v_ad;

  if v_ad is not null then
    return 'settled';
  end if;
  if exists (select 1 from public.ads where razorpay_order_id = v_order and payment_status = 'paid') then
    return 'already_paid';
  end if;
  perform pgmq.send('dlq', jsonb_build_object(
    'queue', 'payments', 'kind', 'report', 'msg', p_payload,
    'error', 'payment matched no pending ad at its price: order ' || v_order, 'at', now()));
  return 'unmatched';
end;
$$;


ALTER FUNCTION "public"."settle_ad_payment"("p_event_id" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."target_progress"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("habit_best_streak" integer, "habit_active" integer, "fitness_workouts_week" integer, "fitness_calories_today" numeric, "expense_net_month" numeric, "expense_currency" "text", "tasks_open" integer, "tasks_due_today" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with days as (
    select habit_client_id, date,
      date - (row_number() over (partition by habit_client_id order by date))::int as grp
    from public.habit_entry where user_id = p_user
  ),
  runs as (
    select habit_client_id, grp, count(*) as len, max(date) as run_end
    from days group by habit_client_id, grp
  ),
  hstreak as (
    select coalesce(max(len) filter (where run_end >= current_date - 1), 0)::int as best from runs
  )
  select
    (select best from hstreak),
    (select count(*)::int from public.habit where user_id = p_user and not archived),
    (select count(*)::int from public.fitness_workout where user_id = p_user and date >= date_trunc('week', current_date)::date),
    coalesce((select sum(calories) from public.fitness_meal where user_id = p_user and date = current_date), 0),
    coalesce((
      select sum(amount) filter (where type = 'income'  and date >= date_trunc('month', current_date)::date)
           - sum(amount) filter (where type = 'expense' and date >= date_trunc('month', current_date)::date)
      from public.expense_tx where user_id = p_user
    ), 0),
    (select currency from public.expense_settings where user_id = p_user),
    (select count(*)::int from public.task_item where user_id = p_user and not done),
    (select count(*)::int from public.task_item where user_id = p_user and not done and due = current_date);
$$;


ALTER FUNCTION "public"."target_progress"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."task_stats"("p_user" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("open_count" integer, "done_count" integer, "due_today" integer, "overdue" integer, "high_open" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select
    count(*) filter (where not done)::int,
    count(*) filter (where done)::int,
    count(*) filter (where not done and due = current_date)::int,
    count(*) filter (where not done and due < current_date)::int,
    count(*) filter (where not done and priority = 'high')::int
  from public.task_item
  where user_id = p_user;
$$;


ALTER FUNCTION "public"."task_stats"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_dm_on_reaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.direct_messages
     set reactions_changed_at = now()
   where id = coalesce(new.message_id, old.message_id);
  return null;
end;
$$;


ALTER FUNCTION "public"."touch_dm_on_reaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_habit_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "public"."touch_habit_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_group_meta"("p_conversation_id" "uuid", "p_title" "text", "p_avatar_color" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.assert_group_admin(p_conversation_id);
  update public.dm_conversations
     set title = coalesce(nullif(trim(p_title), ''), title),
         avatar_color = coalesce(nullif(trim(p_avatar_color), ''), avatar_color)
   where id = p_conversation_id and coalesce(is_group, false) = true;
end;
$$;


ALTER FUNCTION "public"."update_group_meta"("p_conversation_id" "uuid", "p_title" "text", "p_avatar_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_age_years"("p_uid" "uuid" DEFAULT "auth"."uid"()) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case
           when p.date_of_birth is null then null
           else extract(year from age(current_date, p.date_of_birth))::int
         end
  from public.profiles p
  where p.id = p_uid
    and (
      p_uid = auth.uid()
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    );
$$;


ALTER FUNCTION "public"."user_age_years"("p_uid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_age_years"("p_uid" "uuid") IS 'Age in years for a user. Returns NULL unless the caller is asking about themselves or is the service role — SECURITY DEFINER would otherwise bypass the date_of_birth column revoke for any uuid the caller supplies.';



CREATE OR REPLACE FUNCTION "public"."username_available"("p_username" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
        where lower(p.username) = lower(p_username)
          and p.id <> auth.uid()
     );
$$;


ALTER FUNCTION "public"."username_available"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_date_of_birth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_age integer;
begin
  if new.date_of_birth is null then
    return new;
  end if;

  if new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future';
  end if;
  if new.date_of_birth < current_date - interval '120 years' then
    raise exception 'date_of_birth is not a plausible date';
  end if;

  v_age := extract(year from age(current_date, new.date_of_birth))::int;
  if v_age < public.minimum_age_years() then
    raise exception 'Echo requires a minimum age of % years', public.minimum_age_years()
      using errcode = 'check_violation';
  end if;

  -- Under the DPDP child threshold: no behavioural profiling, regardless of
  -- what the client asked for. Enforced here so it cannot be bypassed by
  -- writing the column directly.
  if v_age < public.adult_age_years() then
    new.personalized_notifications := false;
  end if;

  if new.date_of_birth is distinct from old.date_of_birth then
    new.age_collected_at := now();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_date_of_birth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_message_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conversation uuid;
begin
  if new.target_type <> 'message' or new.disclosed_content is null then
    new.disclosed_at := null;
    return new;
  end if;
  select m.conversation_id into v_conversation
    from public.direct_messages m
   where m.id = new.target_id;
  if v_conversation is null then
    raise exception 'A message report must reference an existing message' using errcode = '23503';
  end if;
  if not public.is_dm_conversation_member(v_conversation, new.reporter_id) then
    raise exception 'Only a participant in that conversation can report its messages' using errcode = '42501';
  end if;
  new.disclosed_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_message_report"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_events" (
    "ad_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "day" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_events_kind_check" CHECK (("kind" = ANY (ARRAY['view'::"text", 'click'::"text"])))
);


ALTER TABLE "public"."ad_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ad_events" IS 'One row per user per ad per kind per UTC day. The primary key is the dedup rule for increment_ad_view / increment_ad_click — dropping it silently reopens unbounded counter inflation. scripts/audit-backend.mjs asserts it.';



CREATE TABLE IF NOT EXISTS "public"."ads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "advertiser_id" "uuid",
    "campaign_name" "text" NOT NULL,
    "media_url" "text",
    "headline" "text" NOT NULL,
    "body" "text",
    "call_to_action" "text" DEFAULT 'Learn More'::"text" NOT NULL,
    "target_url" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "views" bigint DEFAULT 0 NOT NULL,
    "clicks" bigint DEFAULT 0 NOT NULL,
    "budget_amount" numeric DEFAULT 0 NOT NULL,
    "razorpay_order_id" "text",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL
);


ALTER TABLE "public"."ads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'New chat'::"text" NOT NULL,
    "model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text",
    "tool_calls" "jsonb",
    "tool_call_id" "text",
    "tool_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'tool'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."ai_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_rate_limits" (
    "user_id" "uuid" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "limit_per_hour" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "ai_rate_limits_plan_id_check" CHECK (("plan_id" = ANY (ARRAY['free'::"text", 'plus'::"text", 'pro'::"text", 'founder'::"text"])))
);


ALTER TABLE "public"."ai_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_tool_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tool_name" "text" NOT NULL,
    "args" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "status" "text" DEFAULT 'executed'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_tool_calls_status_check" CHECK (("status" = ANY (ARRAY['pending_confirm'::"text", 'executed'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_tool_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_rate_limits" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "limit_count" integer NOT NULL,
    "window_seconds" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appeals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid",
    "appellant_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "moderator_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "decision_id" "uuid",
    CONSTRAINT "appeal_target_exactly_one" CHECK (((("report_id" IS NOT NULL) AND ("decision_id" IS NULL)) OR (("report_id" IS NULL) AND ("decision_id" IS NOT NULL)))),
    CONSTRAINT "appeals_reason_check" CHECK ((("char_length"("reason") >= 20) AND ("char_length"("reason") <= 2000))),
    CONSTRAINT "appeals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'upheld'::"text", 'overturned'::"text"])))
);


ALTER TABLE "public"."appeals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "tier" "text" DEFAULT 'bronze'::"text" NOT NULL,
    "criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "badges_tier_check" CHECK (("tier" = ANY (ARRAY['bronze'::"text", 'silver'::"text", 'gold'::"text", 'special'::"text"])))
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookmark_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bookmark_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_runs" (
    "question_id" "uuid" NOT NULL,
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."broadcast_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."broadcast_runs" IS 'One row per daily question that has been broadcast, so a repeated run sends nothing. Server-only.';



CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "kind" "text" NOT NULL,
    "status" "text" DEFAULT 'ringing'::"text" NOT NULL,
    "room_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "calls_kind_check" CHECK (("kind" = ANY (ARRAY['audio'::"text", 'video'::"text"]))),
    CONSTRAINT "calls_status_check" CHECK (("status" = ANY (ARRAY['ringing'::"text", 'accepted'::"text", 'rejected'::"text", 'ended'::"text", 'missed'::"text"])))
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_likes" (
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_mentions" (
    "comment_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."comment_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_reactions" (
    "comment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comment_reactions_reaction_check" CHECK (("reaction" = ANY (ARRAY['mind_blown'::"text", 'taking_notes'::"text", 'agree'::"text", 'disagree'::"text"])))
);


ALTER TABLE "public"."comment_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_answer_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "answer_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_answer_reactions_emoji_check" CHECK (("length"("emoji") <= 10))
);


ALTER TABLE "public"."daily_answer_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "answer" "text" NOT NULL,
    "echo_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "embedding" "extensions"."vector"(768)
);


ALTER TABLE "public"."daily_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_question_bank" (
    "id" bigint NOT NULL,
    "question" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_question_bank" OWNER TO "postgres";


ALTER TABLE "public"."daily_question_bank" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."daily_question_bank_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."direct_message_keys" (
    "message_id" "uuid" NOT NULL,
    "device_id" "uuid" NOT NULL,
    "wrapped_key" "text" NOT NULL,
    "nonce" "text" NOT NULL,
    CONSTRAINT "direct_message_keys_nonce_check" CHECK (("nonce" ~ '^[0-9a-f]{48}$'::"text")),
    CONSTRAINT "direct_message_keys_wrapped_key_check" CHECK (("wrapped_key" ~ '^[0-9a-f]{96}$'::"text"))
);


ALTER TABLE "public"."direct_message_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "text" "text",
    "media_url" "text",
    "voice_url" "text",
    "voice_duration_ms" integer,
    "shared_echo_id" "uuid",
    "link_preview" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "reply_to_id" "uuid",
    "edited_at" timestamp with time zone,
    "ciphertext" "text",
    "nonce" "text",
    "ephemeral_public_key" "text",
    "enc_version" smallint,
    "reactions_changed_at" timestamp with time zone,
    CONSTRAINT "direct_messages_encryption_coherent" CHECK (((("ciphertext" IS NULL) AND ("nonce" IS NULL) AND ("ephemeral_public_key" IS NULL) AND ("enc_version" IS NULL)) OR (("ciphertext" IS NOT NULL) AND ("nonce" ~ '^[0-9a-f]{48}$'::"text") AND ("ephemeral_public_key" ~ '^[0-9a-f]{64}$'::"text") AND ("enc_version" = 1) AND ("text" IS NULL) AND ("kind" = ANY (ARRAY['text'::"text", 'link'::"text", 'contact'::"text", 'echo'::"text"]))))),
    CONSTRAINT "direct_messages_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'image'::"text", 'voice'::"text", 'echo'::"text", 'link'::"text", 'contact'::"text"])))
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."direct_messages"."reactions_changed_at" IS 'Bumped by message_reactions changes so the row''s UPDATE carries them over realtime. Not read by the client.';



CREATE TABLE IF NOT EXISTS "public"."dm_conversation_members" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dm_conversation_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."dm_conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_text" "text",
    "last_message_kind" "text" DEFAULT 'text'::"text",
    "pinned_message_id" "uuid",
    "is_group" boolean DEFAULT false NOT NULL,
    "title" "text",
    "avatar_color" "text" DEFAULT '#C65F3F'::"text",
    "created_by" "uuid"
);


ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_prefs" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "muted" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "muted_until" timestamp with time zone,
    "nicknames" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "theme" "text",
    "quick_reaction" "text",
    "marked_unread" boolean DEFAULT false NOT NULL,
    "disappearing_seconds" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."dm_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_bookmarks" (
    "user_id" "uuid" NOT NULL,
    "echo_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "collection_id" "uuid"
);


ALTER TABLE "public"."echo_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "echo_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "likes_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_comment_id" "uuid",
    "mind_blown_count" integer DEFAULT 0 NOT NULL,
    "taking_notes_count" integer DEFAULT 0 NOT NULL,
    "agree_count" integer DEFAULT 0 NOT NULL,
    "disagree_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."echo_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "echo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."echo_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_mentions" (
    "echo_id" "uuid" NOT NULL,
    "mentioned_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."echo_mentions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_echoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "response" "text" NOT NULL,
    "likes_count" integer DEFAULT 0 NOT NULL,
    "comment_count" integer DEFAULT 0 NOT NULL,
    "repost_count" integer DEFAULT 0 NOT NULL,
    "view_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_urls" "text"[] DEFAULT '{}'::"text"[],
    "quoted_echo_id" "uuid",
    "pinned_at" timestamp with time zone,
    "mind_blown_count" integer DEFAULT 0 NOT NULL,
    "taking_notes_count" integer DEFAULT 0 NOT NULL,
    "agree_count" integer DEFAULT 0 NOT NULL,
    "disagree_count" integer DEFAULT 0 NOT NULL,
    "salon_id" "uuid",
    "co_author_id" "uuid",
    "co_author_response" "text",
    "parent_echo_id" "uuid",
    "remix_root_id" "uuid",
    "source_conversation_id" "uuid",
    "conversation_snapshot" "jsonb",
    "embedding" "extensions"."vector"(768),
    "remix_count" integer DEFAULT 0 NOT NULL,
    "thoughtfulness_score" double precision DEFAULT 0 NOT NULL,
    "check_content" boolean DEFAULT false NOT NULL,
    "post_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "perspective_type" "text",
    "perspective_note" "text",
    "source_url" "text",
    "music_title" "text",
    "music_artist" "text",
    "music_url" "text",
    "hls_url" "text",
    "moderated_at" timestamp with time zone,
    "content_version" integer DEFAULT 1 NOT NULL,
    "media_alt" "text"[],
    CONSTRAINT "public_echoes_media_alt_check" CHECK ("public"."alt_texts_ok"("media_alt")),
    CONSTRAINT "public_echoes_perspective_type_check" CHECK ((("perspective_type" IS NULL) OR ("perspective_type" = ANY (ARRAY['agree'::"text", 'challenge'::"text", 'reframe'::"text", 'story'::"text", 'evidence'::"text", 'question'::"text"])))),
    CONSTRAINT "public_echoes_source_url_check" CHECK ((("source_url" IS NULL) OR ("source_url" ~* '^https?://'::"text")))
);


ALTER TABLE "public"."public_echoes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."public_echoes"."moderated_at" IS 'When a moderation verdict was recorded, whatever the verdict. Null plus check_content = false means still waiting, which is what the ops probe counts.';



COMMENT ON COLUMN "public"."public_echoes"."content_version" IS 'Bumped by trigger on every change to title, prompt, response or media_urls. A moderation verdict is written only where this still equals the version that was judged.';



CREATE OR REPLACE VIEW "public"."echo_reaction_summary" WITH ("security_invoker"='true') AS
 SELECT "id" AS "echo_id",
    "mind_blown_count",
    "taking_notes_count",
    "agree_count",
    "disagree_count",
    (((COALESCE("mind_blown_count", 0) + COALESCE("taking_notes_count", 0)) + COALESCE("agree_count", 0)) + COALESCE("disagree_count", 0)) AS "total_reactions"
   FROM "public"."public_echoes" "e";


ALTER VIEW "public"."echo_reaction_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_reactions" (
    "echo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reaction" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "echo_reactions_reaction_check" CHECK (("reaction" = ANY (ARRAY['mind_blown'::"text", 'taking_notes'::"text", 'agree'::"text", 'disagree'::"text"])))
);


ALTER TABLE "public"."echo_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_reposts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "echo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."echo_reposts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."echo_views" (
    "echo_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."echo_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."erasure_requests" (
    "user_id" "uuid" NOT NULL,
    "state" "text" DEFAULT 'requested'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    CONSTRAINT "erasure_requests_state_check" CHECK (("state" = ANY (ARRAY['requested'::"text", 'media_purged'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."erasure_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."erasure_requests" IS 'One row per account deletion: where it has reached, and the last error. Kept after the account is gone as the record of the erasure. Server-only.';



CREATE TABLE IF NOT EXISTS "public"."expense_settings" (
    "user_id" "uuid" NOT NULL,
    "budget" numeric,
    "currency" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_tx" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "category" "text",
    "note" "text",
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_tx_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."expense_tx" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


COMMENT ON TABLE "public"."feature_flags" IS 'Remote overrides for lib/featureFlags.ts. Flip a row to disable a feature without a build. See docs/runbook/monitoring.md.';



CREATE TABLE IF NOT EXISTS "public"."fitness_goals" (
    "user_id" "uuid" NOT NULL,
    "calories" numeric,
    "protein" numeric,
    "carbs" numeric,
    "fat" numeric,
    "water_ml" numeric,
    "workouts_per_week" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_meal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text",
    "calories" numeric DEFAULT 0 NOT NULL,
    "protein" numeric DEFAULT 0 NOT NULL,
    "carbs" numeric DEFAULT 0 NOT NULL,
    "fat" numeric DEFAULT 0 NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_meal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_measurement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_measurement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_water" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "ml" numeric DEFAULT 0 NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_water" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_weight" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "kg" numeric NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_weight" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fitness_workout" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "title" "text",
    "exercises" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fitness_workout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follow_requests" (
    "requester_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "follow_requests_not_self" CHECK (("requester_id" <> "target_id"))
);


ALTER TABLE "public"."follow_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "follows_check" CHECK (("follower_id" <> "following_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."habit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "marker" "text",
    "color" "text",
    "weekly_goal" integer,
    "scheduled_days" integer[],
    "daily_target" integer,
    "reminder" "jsonb",
    "archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."habit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."habit_entry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "habit_client_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "note" "text",
    "checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."habit_entry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_embeddings" (
    "interest" "text" NOT NULL,
    "embedding" "extensions"."vector"(768) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interest_embeddings" OWNER TO "postgres";


COMMENT ON TABLE "public"."interest_embeddings" IS 'One vector per interest label, written by the embed-interests function with the same model that embeds posts. Read only by refresh_user_taste.';



CREATE TABLE IF NOT EXISTS "public"."learn_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "learner_id" "uuid",
    "guest_name" "text",
    "guest_email" "text",
    "guest_token" "text",
    "package_id" "uuid",
    "slot_id" "uuid",
    "scheduled_for" timestamp with time zone,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "meeting_room" "text",
    "meeting_link" "text",
    "prep_note" "text",
    "homework" "text",
    "follow_up" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learn_bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'pending'::"text", 'paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "learn_bookings_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'accepted'::"text", 'scheduled'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."learn_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learn_lecture_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "lecture_id" "uuid",
    "booking_id" "uuid",
    "at_seconds" integer,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learn_notes_has_subject" CHECK ((("lecture_id" IS NOT NULL) OR ("booking_id" IS NOT NULL)))
);


ALTER TABLE "public"."learn_lecture_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learn_lectures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text" NOT NULL,
    "r2_key" "text",
    "external_url" "text",
    "duration_seconds" integer,
    "size_bytes" bigint,
    "thumbnail_url" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learn_lectures_source_check" CHECK (("source" = ANY (ARRAY['upload'::"text", 'link'::"text"]))),
    CONSTRAINT "learn_lectures_source_shape" CHECK (((("source" = 'upload'::"text") AND ("r2_key" IS NOT NULL) AND ("external_url" IS NULL)) OR (("source" = 'link'::"text") AND ("external_url" IS NOT NULL) AND ("r2_key" IS NULL)))),
    CONSTRAINT "learn_lectures_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'learners'::"text", 'public'::"text"])))
);


ALTER TABLE "public"."learn_lectures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learn_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "sessions" integer DEFAULT 1 NOT NULL,
    "minutes" integer DEFAULT 60 NOT NULL,
    "price" numeric(10,2),
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learn_packages_minutes_check" CHECK ((("minutes" >= 5) AND ("minutes" <= 480))),
    CONSTRAINT "learn_packages_sessions_check" CHECK ((("sessions" >= 1) AND ("sessions" <= 100)))
);


ALTER TABLE "public"."learn_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learn_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "start_minute" integer NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "learn_slots_duration_minutes_check" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 480))),
    CONSTRAINT "learn_slots_start_minute_check" CHECK ((("start_minute" >= 0) AND ("start_minute" <= 1439))),
    CONSTRAINT "learn_slots_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."learn_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learn_tutors" (
    "user_id" "uuid" NOT NULL,
    "headline" "text" DEFAULT ''::"text" NOT NULL,
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "subjects" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hourly_rate" numeric(10,2),
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "public_slug" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."learn_tutors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marketplace_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    "condition" "text" DEFAULT 'Good'::"text" NOT NULL,
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "location_label" "text",
    "fulfillment" "text" DEFAULT 'To be arranged'::"text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_content" boolean DEFAULT false NOT NULL,
    "moderated_at" timestamp with time zone,
    "content_version" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "marketplace_listings_condition_check" CHECK (("condition" = ANY (ARRAY['New'::"text", 'Like new'::"text", 'Good'::"text", 'Service'::"text"]))),
    CONSTRAINT "marketplace_listings_currency_check" CHECK (("currency" = ANY (ARRAY['USD'::"text", 'INR'::"text", 'EUR'::"text", 'GBP'::"text", 'AED'::"text", 'AUD'::"text", 'CAD'::"text", 'SGD'::"text", 'JPY'::"text", 'CNY'::"text", 'HKD'::"text", 'NZD'::"text", 'CHF'::"text", 'SEK'::"text", 'NOK'::"text", 'DKK'::"text", 'ZAR'::"text", 'BRL'::"text", 'MXN'::"text", 'KRW'::"text", 'THB'::"text", 'MYR'::"text", 'IDR'::"text", 'PHP'::"text", 'VND'::"text", 'TRY'::"text", 'SAR'::"text", 'QAR'::"text", 'KWD'::"text", 'BHD'::"text", 'OMR'::"text", 'ILS'::"text", 'EGP'::"text", 'PLN'::"text", 'CZK'::"text", 'HUF'::"text", 'RON'::"text", 'RUB'::"text", 'NGN'::"text", 'KES'::"text", 'GHS'::"text", 'PKR'::"text", 'BDT'::"text", 'LKR'::"text", 'NPR'::"text", 'TWD'::"text", 'ARS'::"text", 'CLP'::"text", 'COP'::"text", 'PEN'::"text", 'UYU'::"text", 'MAD'::"text", 'DZD'::"text", 'TND'::"text", 'UAH'::"text", 'BGN'::"text", 'RSD'::"text", 'ISK'::"text", 'KZT'::"text", 'GEL'::"text", 'JOD'::"text", 'MUR'::"text", 'MOP'::"text", 'CRC'::"text"]))),
    CONSTRAINT "marketplace_listings_description_check" CHECK (("char_length"("description") <= 2000)),
    CONSTRAINT "marketplace_listings_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "marketplace_listings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'sold'::"text", 'paused'::"text", 'removed'::"text"]))),
    CONSTRAINT "marketplace_listings_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."marketplace_listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."marketplace_listings"."check_content" IS 'True once the judge has passed this version of the listing. Only the service role can set it.';



COMMENT ON COLUMN "public"."marketplace_listings"."content_version" IS 'Bumped by trigger on every change to title, description, tags or photo_urls. A verdict is written only where this still equals the version that was judged.';



CREATE TABLE IF NOT EXISTS "public"."media_url_hosts" (
    "host" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_url_hosts" OWNER TO "postgres";


COMMENT ON TABLE "public"."media_url_hosts" IS 'Hosts that may appear in public_echoes.media_urls / hls_url. Add a row to allow a new media origin; nothing client-facing may write here.';



CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_check" CHECK (("length"("emoji") <= 10))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mini_app_data" (
    "user_id" "uuid" NOT NULL,
    "app" "text" NOT NULL,
    "data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mini_app_data_app_check" CHECK (("app" = ANY (ARRAY['calculator'::"text", 'converter'::"text", 'bill-splitter'::"text", 'pomodoro'::"text", 'learn'::"text", 'password-gen'::"text", 'world-clock'::"text", 'markdown'::"text", 'tasks'::"text", 'planner'::"text", 'shopping-list'::"text", 'bmi'::"text", 'fitness'::"text", 'camera'::"text", 'voice-memo'::"text", 'notes'::"text", 'habits'::"text", 'expenses'::"text"])))
);


ALTER TABLE "public"."mini_app_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mini_app_share" (
    "user_id" "uuid" NOT NULL,
    "share_habits" boolean DEFAULT false NOT NULL,
    "share_fitness" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mini_app_share" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "echo_id" "uuid",
    "decision_type" "text" NOT NULL,
    "ground" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "automated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "appeal_deadline" timestamp with time zone DEFAULT ("now"() + '6 mons'::interval) NOT NULL,
    CONSTRAINT "moderation_decisions_decision_type_check" CHECK (("decision_type" = ANY (ARRAY['content_removed'::"text", 'content_restricted'::"text", 'account_suspended'::"text"])))
);


ALTER TABLE "public"."moderation_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "actor_id" "uuid",
    "target_kind" "text",
    "target_id" "uuid",
    "preview" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissed_at" timestamp with time zone,
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['like'::"text", 'comment'::"text", 'follow'::"text", 'repost'::"text", 'mention'::"text", 'dm'::"text", 'reaction'::"text", 'bookmark'::"text", 'quote'::"text", 'report_resolved'::"text", 'content_removed'::"text", 'appeal_resolved'::"text", 'daily_react'::"text", 'personal_nudge'::"text", 'friend_post'::"text", 'social_task_update'::"text", 'friend_answer'::"text", 'report_urgent'::"text", 'rules_reminder'::"text", 'follow_request'::"text", 'follow_accepted'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notifications"."dismissed_at" IS 'Set when the recipient swipes the row away. Non-null rows are filtered from the list; the row is kept because push-fanout and retention read this table as history.';



CREATE OR REPLACE VIEW "public"."notification_groups" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    "type",
    COALESCE(("target_id")::"text", ("actor_id")::"text") AS "bucket_target",
    "date_trunc"('hour'::"text", "created_at") AS "bucket_hour",
    "count"(*) AS "actor_count",
    ("array_agg"("actor_id" ORDER BY "created_at" DESC))[1:3] AS "latest_actor_ids",
    "max"("created_at") AS "latest_created_at",
    "max"("preview") AS "preview",
    "bool_or"(("read_at" IS NULL)) AS "has_unread"
   FROM "public"."notifications"
  GROUP BY "user_id", "type", COALESCE(("target_id")::"text", ("actor_id")::"text"), ("date_trunc"('hour'::"text", "created_at"));


ALTER VIEW "public"."notification_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_profiles" (
    "user_id" "uuid" NOT NULL,
    "best_hours" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "top_surface" "text",
    "last_nudged_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."office_hour_question_upvotes" (
    "question_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."office_hour_question_upvotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."office_hour_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "office_hour_id" "uuid" NOT NULL,
    "asker_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text",
    "upvote_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."office_hour_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."office_hour_rsvps" (
    "office_hour_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."office_hour_rsvps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."office_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "host_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "description" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "rsvp_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "office_hours_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'ended'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."office_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" NOT NULL
);


ALTER TABLE "public"."payment_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_events" IS 'One row per Razorpay webhook event, so a redelivery settles nothing twice. Server-only.';



CREATE TABLE IF NOT EXISTS "public"."probe_runs" (
    "id" bigint NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "check_name" "text" NOT NULL,
    "ok" boolean NOT NULL,
    "detail" "text",
    "alerted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."probe_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."probe_runs" IS 'One row per check per probe run. Server-only: the probe writes it with the service key.';



CREATE SEQUENCE IF NOT EXISTS "public"."probe_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."probe_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."probe_runs_id_seq" OWNED BY "public"."probe_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_color" "text" DEFAULT '#C65F3F'::"text" NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avatar_url" "text",
    "push_token" "text",
    "language" "text" DEFAULT 'en'::"text",
    "e2e_public_key" "text",
    "follower_count" integer DEFAULT 0 NOT NULL,
    "pronouns" "text",
    "mood" "text",
    "mood_expires_at" timestamp with time zone,
    "pinned_echo_id" "uuid",
    "is_private" boolean DEFAULT false NOT NULL,
    "dm_privacy" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "activity_status" boolean DEFAULT true NOT NULL,
    "online_status" boolean DEFAULT true NOT NULL,
    "read_receipts" boolean DEFAULT true NOT NULL,
    "ai_model" "text" DEFAULT 'gemini-2.5-flash'::"text" NOT NULL,
    "sensitive_content_filter" boolean DEFAULT true NOT NULL,
    "content_language" "text" DEFAULT 'English'::"text" NOT NULL,
    "stream_responses" boolean DEFAULT true NOT NULL,
    "auto_save_chats" boolean DEFAULT true NOT NULL,
    "is_moderator" boolean DEFAULT false NOT NULL,
    "personalized_notifications" boolean DEFAULT true NOT NULL,
    "show_active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "public_key" "text",
    "premium_entitlement" "text" DEFAULT 'free'::"text",
    "premium_updated_at" bigint DEFAULT 0,
    "date_of_birth" "date",
    "age_collected_at" timestamp with time zone,
    "notification_prefs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "allow_downloads" boolean DEFAULT true NOT NULL,
    "onboarded_at" timestamp with time zone,
    "hidden_from_discovery" boolean DEFAULT false NOT NULL,
    "rank_points" integer DEFAULT 0 NOT NULL,
    "rank_tier" smallint DEFAULT 0 NOT NULL,
    "rank_active_at" timestamp with time zone,
    CONSTRAINT "profiles_ai_model_check" CHECK (("ai_model" = ANY (ARRAY['gemini-2.5-flash'::"text", 'gemini-2.5-pro'::"text", 'gemini-2.5-flash-lite'::"text"]))),
    CONSTRAINT "profiles_dm_privacy_check" CHECK (("dm_privacy" = ANY (ARRAY['everyone'::"text", 'followers'::"text", 'nobody'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."personalized_notifications" IS 'Personalized notification timing and content (best hours + top surface in notification_profiles). On by default since 2026-09-30 (India-only launch; notice in privacy policy v3.3); users turn it off in Settings → Privacy. Must be opt-in for any EU launch.';



COMMENT ON COLUMN "public"."profiles"."date_of_birth" IS 'Date of birth, self-declared at signup. Readable only by the owner (see the profiles_self_read_dob policy). Used to derive age for the DPDP Act 2023 child threshold; never exposed on the public profile.';



COMMENT ON COLUMN "public"."profiles"."allow_downloads" IS 'Author opt-out for offline saving. When false, clients must not offer to download this user''s media.';



COMMENT ON COLUMN "public"."profiles"."hidden_from_discovery" IS 'Internal account (e.g. store reviewers): excluded from suggestions, people search and thinking partners. Not client-writable.';



COMMENT ON COLUMN "public"."profiles"."rank_points" IS 'Rank points, stored hourly by refresh_ranks() from rank_breakdowns(). Derived; never written by clients.';



COMMENT ON COLUMN "public"."profiles"."rank_tier" IS '0 Newcomer … 5 Luminary (rank_tier_for). Stored hourly by refresh_ranks().';



COMMENT ON COLUMN "public"."profiles"."rank_active_at" IS 'Last post or comment, for the "active this week" marker. Stored hourly by refresh_ranks().';



CREATE TABLE IF NOT EXISTS "public"."provider_breaker" (
    "provider" "text" NOT NULL,
    "failures" integer DEFAULT 0 NOT NULL,
    "open_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_breaker" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_breaker" IS 'Consecutive transient failures per model provider, and until when calls are refused. Server-only.';



CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "goal_type" "text" NOT NULL,
    "goal_value" integer NOT NULL,
    "reward_xp" integer DEFAULT 100 NOT NULL,
    "reward_badge_id" "uuid",
    "recurrence" "text" DEFAULT 'daily'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "quests_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['post_count'::"text", 'reaction_count'::"text", 'streak_days'::"text", 'mentions_count'::"text", 'daily_answers'::"text"]))),
    CONSTRAINT "quests_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'once'::"text"])))
);


ALTER TABLE "public"."quests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_embedding_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."rag_embedding_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "action_taken" "text",
    "internal_notes" "text",
    "auto_hidden" boolean DEFAULT false NOT NULL,
    "disclosed_content" "text",
    "disclosed_context" "jsonb",
    "disclosed_message_key" "text",
    "disclosed_at" timestamp with time zone,
    CONSTRAINT "reports_disclosed_content_check" CHECK ((("disclosed_content" IS NULL) OR ("length"("disclosed_content") <= 20000))),
    CONSTRAINT "reports_disclosure_coherent" CHECK (((("disclosed_content" IS NULL) AND ("disclosed_context" IS NULL) AND ("disclosed_message_key" IS NULL) AND ("disclosed_at" IS NULL)) OR (("target_type" = 'message'::"text") AND ("disclosed_content" IS NOT NULL) AND ("disclosed_at" IS NOT NULL)))),
    CONSTRAINT "reports_disclosure_context_bounded" CHECK ((("disclosed_context" IS NULL) OR (("jsonb_typeof"("disclosed_context") = 'array'::"text") AND ("jsonb_array_length"("disclosed_context") <= 10)))),
    CONSTRAINT "reports_disclosure_key_shape" CHECK ((("disclosed_message_key" IS NULL) OR ("disclosed_message_key" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['echo'::"text", 'user'::"text", 'comment'::"text", 'message'::"text", 'group'::"text"])))
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."reports"."auto_hidden" IS 'True when this report hid its target echo on arrival (urgent reason). Dismissing the report restores the echo.';



CREATE TABLE IF NOT EXISTS "public"."rules_notices" (
    "user_id" "uuid" NOT NULL,
    "last_notified_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."rules_notices" OWNER TO "postgres";


COMMENT ON TABLE "public"."rules_notices" IS 'When each user was last reminded of the rules (IT Rules 3(1)(c), every 3 months). Server-only.';



CREATE TABLE IF NOT EXISTS "public"."salon_members" (
    "salon_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "salon_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'mod'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."salon_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "cover_color" "text" DEFAULT '#7C3AED'::"text",
    "topic_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "member_count" integer DEFAULT 0 NOT NULL,
    "echo_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."salons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "app_user_id" "text" NOT NULL,
    "event_timestamp" bigint NOT NULL,
    "payload" "jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text"
);


ALTER TABLE "public"."subscription_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_item" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "due" "date",
    "done" boolean DEFAULT false NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "task_item_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."task_item" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."thinking_fingerprints" (
    "user_id" "uuid" NOT NULL,
    "data" "jsonb" NOT NULL,
    "echo_count" integer NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."thinking_fingerprints" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."trending_echoes_mv" AS
 SELECT "id",
    "author_id",
    "created_at",
    "public"."feed_base_score"("likes_count", "comment_count", "repost_count", "view_count", "created_at", (("media_urls" IS NOT NULL) AND ("array_length"("media_urls", 1) > 0))) AS "global_score"
   FROM "public"."public_echoes" "e"
  WHERE ("created_at" > ("now"() - '30 days'::interval))
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."trending_echoes_mv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_auras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "text_content" "text",
    "voice_url" "text",
    "music_url" "text",
    "privacy" "text" DEFAULT 'mutuals'::"text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "music_title" "text",
    "music_artist" "text",
    CONSTRAINT "user_auras_privacy_check" CHECK (("privacy" = ANY (ARRAY['public'::"text", 'mutuals'::"text", 'close_friends'::"text"])))
);


ALTER TABLE "public"."user_auras" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "user_id" "uuid" NOT NULL,
    "badge_id" "uuid" NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_check" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "public_key" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "user_devices_label_check" CHECK (("label" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text", 'macos'::"text"]))),
    CONSTRAINT "user_devices_public_key_check" CHECK (("public_key" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_entitlements" (
    "user_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "exclusive" boolean DEFAULT false NOT NULL,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_entitlements_plan_id_check" CHECK (("plan_id" = ANY (ARRAY['free'::"text", 'plus'::"text", 'pro'::"text", 'founder'::"text"]))),
    CONSTRAINT "user_entitlements_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'app_store'::"text", 'play_store'::"text", 'stripe'::"text", 'founder'::"text"]))),
    CONSTRAINT "user_entitlements_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'trialing'::"text", 'past_due'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."user_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_interests" (
    "user_id" "uuid" NOT NULL,
    "interest" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_interests_interest_check" CHECK ((("length"("interest") >= 1) AND ("length"("interest") <= 64)))
);


ALTER TABLE "public"."user_interests" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_interests" IS 'Interests a person chose for themselves. Private to them, and the seed for their taste vector before they have liked anything.';



CREATE TABLE IF NOT EXISTS "public"."user_mutes" (
    "muter_id" "uuid" NOT NULL,
    "muted_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_mutes_check" CHECK (("muter_id" <> "muted_id"))
);


ALTER TABLE "public"."user_mutes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_not_interested" (
    "user_id" "uuid" NOT NULL,
    "echo_id" "uuid",
    "author_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "user_not_interested_target_chk" CHECK (("num_nonnulls"("echo_id", "author_id") = 1))
);


ALTER TABLE "public"."user_not_interested" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_quests" (
    "user_id" "uuid" NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."user_quests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_taste" (
    "user_id" "uuid" NOT NULL,
    "taste_vector" "extensions"."vector"(768),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "seeded_from" "text"
);


ALTER TABLE "public"."user_taste" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_taste"."seeded_from" IS 'Where the current vector came from: likes, interests, authored, or null when there was nothing to build one out of.';



CREATE TABLE IF NOT EXISTS "public"."verification_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "selfie_path" "text" NOT NULL,
    "pose" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ai_verdict" "jsonb",
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    CONSTRAINT "verification_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."verification_requests" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."visible_echoes" WITH ("security_invoker"='true') AS
 SELECT "id",
    "author_id",
    "title",
    "prompt",
    "response",
    "likes_count",
    "comment_count",
    "repost_count",
    "view_count",
    "created_at",
    "media_urls",
    "quoted_echo_id",
    "pinned_at",
    "mind_blown_count",
    "taking_notes_count",
    "agree_count",
    "disagree_count",
    "salon_id",
    "co_author_id",
    "co_author_response",
    "parent_echo_id",
    "remix_root_id",
    "source_conversation_id",
    "conversation_snapshot",
    "embedding",
    "remix_count",
    "thoughtfulness_score",
    "check_content",
    "post_type",
    "perspective_type",
    "perspective_note",
    "source_url",
    "music_title",
    "music_artist",
    "music_url",
    "hls_url"
   FROM "public"."public_echoes" "e"
  WHERE "public"."can_view_echo_author"("author_id");


ALTER VIEW "public"."visible_echoes" OWNER TO "postgres";


COMMENT ON VIEW "public"."visible_echoes" IS 'public_echoes filtered by can_view_echo_author. Feed RPCs read this instead of the table so a definer function cannot leak private accounts. security_invoker since 20260916120000: inside definer functions the owner still bypasses RLS and the predicate gates; a direct client read gets public_echoes RLS as well. Read-only for client roles.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_link_codes" (
    "code" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_link_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_links" (
    "wa_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "linked_via" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    CONSTRAINT "whatsapp_links_linked_via_check" CHECK (("linked_via" = ANY (ARRAY['phone_match'::"text", 'code'::"text"])))
);


ALTER TABLE "public"."whatsapp_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."year_wraps" (
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "total_echoes" integer DEFAULT 0 NOT NULL,
    "total_likes_received" integer DEFAULT 0 NOT NULL,
    "total_reactions" integer DEFAULT 0 NOT NULL,
    "top_topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "top_echo_id" "uuid",
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."year_wraps" OWNER TO "postgres";


ALTER TABLE ONLY "public"."probe_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."probe_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ad_events"
    ADD CONSTRAINT "ad_events_pkey" PRIMARY KEY ("ad_id", "user_id", "kind", "day");



ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_rate_limits"
    ADD CONSTRAINT "ai_rate_limits_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."ai_tool_calls"
    ADD CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_rate_limits"
    ADD CONSTRAINT "app_rate_limits_pkey" PRIMARY KEY ("user_id", "action");



ALTER TABLE ONLY "public"."appeals"
    ADD CONSTRAINT "appeals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appeals"
    ADD CONSTRAINT "appeals_report_id_appellant_id_key" UNIQUE ("report_id", "appellant_id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."bookmark_collections"
    ADD CONSTRAINT "bookmark_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_runs"
    ADD CONSTRAINT "broadcast_runs_pkey" PRIMARY KEY ("question_id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("comment_id", "user_id");



ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_pkey" PRIMARY KEY ("comment_id", "mentioned_user_id");



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id", "user_id", "reaction");



ALTER TABLE ONLY "public"."daily_answer_reactions"
    ADD CONSTRAINT "daily_answer_reactions_answer_id_user_id_emoji_key" UNIQUE ("answer_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."daily_answer_reactions"
    ADD CONSTRAINT "daily_answer_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_question_id_user_id_key" UNIQUE ("question_id", "user_id");



ALTER TABLE ONLY "public"."daily_question_bank"
    ADD CONSTRAINT "daily_question_bank_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_question_bank"
    ADD CONSTRAINT "daily_question_bank_question_key" UNIQUE ("question");



ALTER TABLE ONLY "public"."daily_questions"
    ADD CONSTRAINT "daily_questions_active_date_key" UNIQUE ("active_date");



ALTER TABLE ONLY "public"."daily_questions"
    ADD CONSTRAINT "daily_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_message_keys"
    ADD CONSTRAINT "direct_message_keys_pkey" PRIMARY KEY ("message_id", "device_id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_conversation_members"
    ADD CONSTRAINT "dm_conversation_members_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_a_user_b_key" UNIQUE ("user_a", "user_b");



ALTER TABLE ONLY "public"."dm_prefs"
    ADD CONSTRAINT "dm_prefs_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."echo_bookmarks"
    ADD CONSTRAINT "echo_bookmarks_pkey" PRIMARY KEY ("user_id", "echo_id");



ALTER TABLE ONLY "public"."echo_comments"
    ADD CONSTRAINT "echo_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."echo_likes"
    ADD CONSTRAINT "echo_likes_echo_id_user_id_key" UNIQUE ("echo_id", "user_id");



ALTER TABLE ONLY "public"."echo_likes"
    ADD CONSTRAINT "echo_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."echo_mentions"
    ADD CONSTRAINT "echo_mentions_pkey" PRIMARY KEY ("echo_id", "mentioned_user_id");



ALTER TABLE ONLY "public"."echo_reactions"
    ADD CONSTRAINT "echo_reactions_pkey" PRIMARY KEY ("echo_id", "user_id", "reaction");



ALTER TABLE ONLY "public"."echo_reposts"
    ADD CONSTRAINT "echo_reposts_echo_id_user_id_key" UNIQUE ("echo_id", "user_id");



ALTER TABLE ONLY "public"."echo_reposts"
    ADD CONSTRAINT "echo_reposts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."echo_views"
    ADD CONSTRAINT "echo_views_pkey" PRIMARY KEY ("echo_id", "user_id");



ALTER TABLE ONLY "public"."erasure_requests"
    ADD CONSTRAINT "erasure_requests_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."expense_settings"
    ADD CONSTRAINT "expense_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."expense_tx"
    ADD CONSTRAINT "expense_tx_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_tx"
    ADD CONSTRAINT "expense_tx_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."fitness_goals"
    ADD CONSTRAINT "fitness_goals_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."fitness_meal"
    ADD CONSTRAINT "fitness_meal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_meal"
    ADD CONSTRAINT "fitness_meal_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."fitness_measurement"
    ADD CONSTRAINT "fitness_measurement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_measurement"
    ADD CONSTRAINT "fitness_measurement_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."fitness_water"
    ADD CONSTRAINT "fitness_water_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_water"
    ADD CONSTRAINT "fitness_water_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."fitness_weight"
    ADD CONSTRAINT "fitness_weight_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_weight"
    ADD CONSTRAINT "fitness_weight_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."fitness_workout"
    ADD CONSTRAINT "fitness_workout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fitness_workout"
    ADD CONSTRAINT "fitness_workout_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("requester_id", "target_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id");



ALTER TABLE ONLY "public"."habit_entry"
    ADD CONSTRAINT "habit_entry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit_entry"
    ADD CONSTRAINT "habit_entry_user_id_habit_client_id_date_key" UNIQUE ("user_id", "habit_client_id", "date");



ALTER TABLE ONLY "public"."habit"
    ADD CONSTRAINT "habit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."habit"
    ADD CONSTRAINT "habit_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."interest_embeddings"
    ADD CONSTRAINT "interest_embeddings_pkey" PRIMARY KEY ("interest");



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_guest_token_key" UNIQUE ("guest_token");



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learn_lecture_notes"
    ADD CONSTRAINT "learn_lecture_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learn_lectures"
    ADD CONSTRAINT "learn_lectures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learn_packages"
    ADD CONSTRAINT "learn_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learn_slots"
    ADD CONSTRAINT "learn_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learn_tutors"
    ADD CONSTRAINT "learn_tutors_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."learn_tutors"
    ADD CONSTRAINT "learn_tutors_public_slug_key" UNIQUE ("public_slug");



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_url_hosts"
    ADD CONSTRAINT "media_url_hosts_pkey" PRIMARY KEY ("host");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_user_id_emoji_key" UNIQUE ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rag_embedding_messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mini_app_data"
    ADD CONSTRAINT "mini_app_data_pkey" PRIMARY KEY ("user_id", "app");



ALTER TABLE ONLY "public"."mini_app_share"
    ADD CONSTRAINT "mini_app_share_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_profiles"
    ADD CONSTRAINT "notification_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."office_hour_question_upvotes"
    ADD CONSTRAINT "office_hour_question_upvotes_pkey" PRIMARY KEY ("question_id", "user_id");



ALTER TABLE ONLY "public"."office_hour_questions"
    ADD CONSTRAINT "office_hour_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."office_hour_rsvps"
    ADD CONSTRAINT "office_hour_rsvps_pkey" PRIMARY KEY ("office_hour_id", "user_id");



ALTER TABLE ONLY "public"."office_hours"
    ADD CONSTRAINT "office_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."probe_runs"
    ADD CONSTRAINT "probe_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."provider_breaker"
    ADD CONSTRAINT "provider_breaker_pkey" PRIMARY KEY ("provider");



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rules_notices"
    ADD CONSTRAINT "rules_notices_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."salon_members"
    ADD CONSTRAINT "salon_members_pkey" PRIMARY KEY ("salon_id", "user_id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."subscription_webhook_events"
    ADD CONSTRAINT "subscription_webhook_events_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."subscription_webhook_events"
    ADD CONSTRAINT "subscription_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_item"
    ADD CONSTRAINT "task_item_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_item"
    ADD CONSTRAINT "task_item_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."thinking_fingerprints"
    ADD CONSTRAINT "thinking_fingerprints_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_auras"
    ADD CONSTRAINT "user_auras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id", "badge_id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_entitlements"
    ADD CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_interests"
    ADD CONSTRAINT "user_interests_pkey" PRIMARY KEY ("user_id", "interest");



ALTER TABLE ONLY "public"."user_mutes"
    ADD CONSTRAINT "user_mutes_pkey" PRIMARY KEY ("muter_id", "muted_id");



ALTER TABLE ONLY "public"."user_not_interested"
    ADD CONSTRAINT "user_not_interested_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_quests"
    ADD CONSTRAINT "user_quests_pkey" PRIMARY KEY ("user_id", "quest_id", "started_at");



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_link_codes"
    ADD CONSTRAINT "whatsapp_link_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."whatsapp_links"
    ADD CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("wa_id");



ALTER TABLE ONLY "public"."year_wraps"
    ADD CONSTRAINT "year_wraps_pkey" PRIMARY KEY ("user_id", "year");



CREATE INDEX "ad_events_user_id_idx" ON "public"."ad_events" USING "btree" ("user_id");



CREATE INDEX "ai_conversations_user_idx" ON "public"."ai_conversations" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "ai_messages_conv_idx" ON "public"."ai_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "ai_tool_calls_user_idx" ON "public"."ai_tool_calls" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "app_rate_limits_updated_idx" ON "public"."app_rate_limits" USING "btree" ("updated_at" DESC);



CREATE INDEX "appeals_appellant_idx" ON "public"."appeals" USING "btree" ("appellant_id");



CREATE UNIQUE INDEX "appeals_decision_appellant_uq" ON "public"."appeals" USING "btree" ("decision_id", "appellant_id") WHERE ("decision_id" IS NOT NULL);



CREATE INDEX "appeals_decision_idx" ON "public"."appeals" USING "btree" ("decision_id");



CREATE INDEX "appeals_report_idx" ON "public"."appeals" USING "btree" ("report_id");



CREATE INDEX "appeals_status_idx" ON "public"."appeals" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "comment_likes_comment_idx" ON "public"."comment_likes" USING "btree" ("comment_id");



CREATE INDEX "comment_likes_user_idx" ON "public"."comment_likes" USING "btree" ("user_id");



CREATE INDEX "direct_message_keys_by_device" ON "public"."direct_message_keys" USING "btree" ("device_id");



CREATE INDEX "dm_conv_user_a_idx" ON "public"."dm_conversations" USING "btree" ("user_a", "last_message_at" DESC);



CREATE INDEX "dm_conv_user_b_idx" ON "public"."dm_conversations" USING "btree" ("user_b", "last_message_at" DESC);



CREATE INDEX "echo_bookmarks_echo_idx" ON "public"."echo_bookmarks" USING "btree" ("echo_id");



CREATE INDEX "echo_bookmarks_user_idx" ON "public"."echo_bookmarks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "echo_comments_author_idx" ON "public"."echo_comments" USING "btree" ("author_id");



CREATE INDEX "echo_comments_echo_idx" ON "public"."echo_comments" USING "btree" ("echo_id", "created_at");



CREATE INDEX "echo_comments_echo_parent_idx" ON "public"."echo_comments" USING "btree" ("echo_id", "parent_comment_id" DESC NULLS LAST);



CREATE INDEX "echo_likes_echo_idx" ON "public"."echo_likes" USING "btree" ("echo_id");



CREATE INDEX "echo_likes_user_idx" ON "public"."echo_likes" USING "btree" ("user_id");



CREATE INDEX "echo_reposts_echo_idx" ON "public"."echo_reposts" USING "btree" ("echo_id");



CREATE INDEX "echo_reposts_echo_user_idx" ON "public"."echo_reposts" USING "btree" ("echo_id", "user_id");



CREATE INDEX "echo_reposts_user_idx" ON "public"."echo_reposts" USING "btree" ("user_id");



CREATE INDEX "echo_views_echo_user_idx" ON "public"."echo_views" USING "btree" ("echo_id", "user_id");



CREATE INDEX "echo_views_user_created_idx" ON "public"."echo_views" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "echo_views_user_idx" ON "public"."echo_views" USING "btree" ("user_id");



CREATE INDEX "expense_tx_user_cat_idx" ON "public"."expense_tx" USING "btree" ("user_id", "category");



CREATE INDEX "expense_tx_user_date_idx" ON "public"."expense_tx" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "fitness_meal_user_date_idx" ON "public"."fitness_meal" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "fitness_water_user_date_idx" ON "public"."fitness_water" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "fitness_weight_user_date_idx" ON "public"."fitness_weight" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "fitness_workout_user_date_idx" ON "public"."fitness_workout" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "follow_requests_target_idx" ON "public"."follow_requests" USING "btree" ("target_id", "created_at" DESC);



CREATE INDEX "follows_following_follower_idx" ON "public"."follows" USING "btree" ("following_id", "follower_id");



CREATE INDEX "habit_entry_habit_idx" ON "public"."habit_entry" USING "btree" ("user_id", "habit_client_id", "date" DESC);



CREATE INDEX "habit_entry_user_date_idx" ON "public"."habit_entry" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "habit_user_idx" ON "public"."habit" USING "btree" ("user_id");



CREATE INDEX "idx_ads_advertiser_id" ON "public"."ads" USING "btree" ("advertiser_id");



CREATE INDEX "idx_ads_is_active" ON "public"."ads" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_ai_messages_user_id" ON "public"."ai_messages" USING "btree" ("user_id");



CREATE INDEX "idx_ai_rate_limits_window_start" ON "public"."ai_rate_limits" USING "btree" ("window_start" DESC);



CREATE INDEX "idx_ai_tool_calls_conversation_id" ON "public"."ai_tool_calls" USING "btree" ("conversation_id");



CREATE INDEX "idx_ai_tool_calls_message_id" ON "public"."ai_tool_calls" USING "btree" ("message_id");



CREATE INDEX "idx_bookmark_collections_owner_id" ON "public"."bookmark_collections" USING "btree" ("owner_id");



CREATE INDEX "idx_calls_callee_id" ON "public"."calls" USING "btree" ("callee_id");



CREATE INDEX "idx_calls_caller_id" ON "public"."calls" USING "btree" ("caller_id");



CREATE INDEX "idx_calls_conversation_id" ON "public"."calls" USING "btree" ("conversation_id");



CREATE INDEX "idx_comment_mentions_user" ON "public"."comment_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_comment_reactions_comment" ON "public"."comment_reactions" USING "btree" ("comment_id");



CREATE INDEX "idx_comment_reactions_user" ON "public"."comment_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_daily_answer_reactions_answer" ON "public"."daily_answer_reactions" USING "btree" ("answer_id");



CREATE INDEX "idx_daily_answer_reactions_user_id" ON "public"."daily_answer_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_daily_answers_echo_id" ON "public"."daily_answers" USING "btree" ("echo_id");



CREATE INDEX "idx_daily_answers_question" ON "public"."daily_answers" USING "btree" ("question_id");



CREATE INDEX "idx_daily_answers_user" ON "public"."daily_answers" USING "btree" ("user_id");



CREATE INDEX "idx_direct_messages_sender_id" ON "public"."direct_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_direct_messages_shared_echo_id" ON "public"."direct_messages" USING "btree" ("shared_echo_id");



CREATE INDEX "idx_dm_conv_created" ON "public"."direct_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_dm_conversations_created_by" ON "public"."dm_conversations" USING "btree" ("created_by");



CREATE INDEX "idx_dm_conversations_pinned_message_id" ON "public"."dm_conversations" USING "btree" ("pinned_message_id");



CREATE INDEX "idx_dm_members_user" ON "public"."dm_conversation_members" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "idx_dm_prefs_user_id" ON "public"."dm_prefs" USING "btree" ("user_id");



CREATE INDEX "idx_dm_reply_to" ON "public"."direct_messages" USING "btree" ("reply_to_id");



CREATE INDEX "idx_dm_text_trgm" ON "public"."direct_messages" USING "gin" ("text" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_echo_bookmarks_collection" ON "public"."echo_bookmarks" USING "btree" ("user_id", "collection_id");



CREATE INDEX "idx_echo_bookmarks_collection_id" ON "public"."echo_bookmarks" USING "btree" ("collection_id");



CREATE INDEX "idx_echo_comments_parent" ON "public"."echo_comments" USING "btree" ("parent_comment_id") WHERE ("parent_comment_id" IS NOT NULL);



CREATE INDEX "idx_echo_mentions_user" ON "public"."echo_mentions" USING "btree" ("mentioned_user_id");



CREATE INDEX "idx_echo_reactions_echo" ON "public"."echo_reactions" USING "btree" ("echo_id");



CREATE INDEX "idx_echo_reactions_user" ON "public"."echo_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_learn_bookings_learner" ON "public"."learn_bookings" USING "btree" ("learner_id", "scheduled_for" DESC);



CREATE INDEX "idx_learn_bookings_package_id" ON "public"."learn_bookings" USING "btree" ("package_id");



CREATE INDEX "idx_learn_bookings_slot_id" ON "public"."learn_bookings" USING "btree" ("slot_id");



CREATE INDEX "idx_learn_bookings_tutor" ON "public"."learn_bookings" USING "btree" ("tutor_id", "scheduled_for" DESC);



CREATE INDEX "idx_learn_lecture_notes_booking_id" ON "public"."learn_lecture_notes" USING "btree" ("booking_id");



CREATE INDEX "idx_learn_lectures_owner" ON "public"."learn_lectures" USING "btree" ("owner_id", "created_at" DESC);



CREATE INDEX "idx_learn_notes_author" ON "public"."learn_lecture_notes" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_learn_notes_lecture" ON "public"."learn_lecture_notes" USING "btree" ("lecture_id", "at_seconds");



CREATE INDEX "idx_learn_packages_tutor" ON "public"."learn_packages" USING "btree" ("tutor_id");



CREATE INDEX "idx_learn_slots_tutor" ON "public"."learn_slots" USING "btree" ("tutor_id");



CREATE INDEX "idx_message_reactions_user_id" ON "public"."message_reactions" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_actor_type_created" ON "public"."notifications" USING "btree" ("actor_id", "type", "created_at" DESC);



CREATE INDEX "idx_notifications_user_active" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("dismissed_at" IS NULL);



CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "idx_office_hour_question_upvotes_user_id" ON "public"."office_hour_question_upvotes" USING "btree" ("user_id");



CREATE INDEX "idx_office_hour_questions_asker_id" ON "public"."office_hour_questions" USING "btree" ("asker_id");



CREATE INDEX "idx_office_hour_rsvps_user_id" ON "public"."office_hour_rsvps" USING "btree" ("user_id");



CREATE INDEX "idx_office_hours_host" ON "public"."office_hours" USING "btree" ("host_id");



CREATE INDEX "idx_office_hours_starts" ON "public"."office_hours" USING "btree" ("starts_at");



CREATE INDEX "idx_oh_questions_oh" ON "public"."office_hour_questions" USING "btree" ("office_hour_id");



CREATE INDEX "idx_oh_questions_upvotes" ON "public"."office_hour_questions" USING "btree" ("upvote_count" DESC);



CREATE INDEX "idx_probe_runs_check_time" ON "public"."probe_runs" USING "btree" ("check_name", "ran_at" DESC);



CREATE INDEX "idx_profiles_dob_null" ON "public"."profiles" USING "btree" ("id") WHERE ("date_of_birth" IS NULL);



CREATE INDEX "idx_public_echoes_author" ON "public"."public_echoes" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_public_echoes_check_content" ON "public"."public_echoes" USING "btree" ("check_content", "created_at" DESC);



CREATE INDEX "idx_public_echoes_co_author" ON "public"."public_echoes" USING "btree" ("co_author_id") WHERE ("co_author_id" IS NOT NULL);



CREATE INDEX "idx_public_echoes_pinned" ON "public"."public_echoes" USING "btree" ("author_id", "pinned_at" DESC NULLS LAST);



CREATE INDEX "idx_public_echoes_quoted_echo_id" ON "public"."public_echoes" USING "btree" ("quoted_echo_id") WHERE ("quoted_echo_id" IS NOT NULL);



CREATE INDEX "idx_public_echoes_salon" ON "public"."public_echoes" USING "btree" ("salon_id") WHERE ("salon_id" IS NOT NULL);



CREATE INDEX "idx_public_echoes_source_conversation_id" ON "public"."public_echoes" USING "btree" ("source_conversation_id");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_quests_reward_badge_id" ON "public"."quests" USING "btree" ("reward_badge_id");



CREATE INDEX "idx_reactions_message_id" ON "public"."message_reactions" USING "btree" ("message_id");



CREATE INDEX "idx_reports_reviewed_by" ON "public"."reports" USING "btree" ("reviewed_by");



CREATE INDEX "idx_salon_members_user" ON "public"."salon_members" USING "btree" ("user_id");



CREATE INDEX "idx_salons_owner" ON "public"."salons" USING "btree" ("owner_id");



CREATE INDEX "idx_sub_webhooks_user_time" ON "public"."subscription_webhook_events" USING "btree" ("app_user_id", "event_timestamp" DESC);



CREATE INDEX "idx_user_auras_user_id" ON "public"."user_auras" USING "btree" ("user_id");



CREATE INDEX "idx_user_badges_badge_id" ON "public"."user_badges" USING "btree" ("badge_id");



CREATE INDEX "idx_user_badges_user" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "idx_user_blocks_blocked_id" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_user_mutes_muted_id" ON "public"."user_mutes" USING "btree" ("muted_id");



CREATE INDEX "idx_user_not_interested_author_id" ON "public"."user_not_interested" USING "btree" ("author_id");



CREATE INDEX "idx_user_not_interested_echo_id" ON "public"."user_not_interested" USING "btree" ("echo_id");



CREATE INDEX "idx_user_quests_quest_id" ON "public"."user_quests" USING "btree" ("quest_id");



CREATE INDEX "idx_user_quests_user" ON "public"."user_quests" USING "btree" ("user_id");



CREATE INDEX "idx_verification_requests_reviewed_by" ON "public"."verification_requests" USING "btree" ("reviewed_by");



CREATE INDEX "idx_whatsapp_link_codes_user" ON "public"."whatsapp_link_codes" USING "btree" ("user_id");



CREATE INDEX "idx_whatsapp_links_user" ON "public"."whatsapp_links" USING "btree" ("user_id");



CREATE INDEX "idx_year_wraps_top_echo_id" ON "public"."year_wraps" USING "btree" ("top_echo_id");



CREATE INDEX "marketplace_listings_category_idx" ON "public"."marketplace_listings" USING "btree" ("category") WHERE ("status" = 'active'::"text");



CREATE INDEX "marketplace_listings_created_at_idx" ON "public"."marketplace_listings" USING "btree" ("created_at" DESC) WHERE ("status" = 'active'::"text");



CREATE INDEX "marketplace_listings_seller_idx" ON "public"."marketplace_listings" USING "btree" ("seller_id");



CREATE INDEX "moderation_decisions_echo_idx" ON "public"."moderation_decisions" USING "btree" ("echo_id");



CREATE INDEX "moderation_decisions_subject_idx" ON "public"."moderation_decisions" USING "btree" ("subject_id");



CREATE UNIQUE INDEX "notifications_friend_post_once" ON "public"."notifications" USING "btree" ("user_id", "target_id") WHERE ("type" = 'friend_post'::"text");



CREATE UNIQUE INDEX "one_pending_verification_per_user" ON "public"."verification_requests" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "profiles_display_name_trgm_idx" ON "public"."profiles" USING "gin" ("display_name" "extensions"."gin_trgm_ops");



CREATE INDEX "profiles_follower_count_idx" ON "public"."profiles" USING "btree" ("follower_count" DESC);



CREATE INDEX "profiles_pinned_echo_id_idx" ON "public"."profiles" USING "btree" ("pinned_echo_id") WHERE ("pinned_echo_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_username_lower_key" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "profiles_username_trgm_idx" ON "public"."profiles" USING "gin" ("username" "extensions"."gin_trgm_ops");



CREATE INDEX "public_echoes_created_idx" ON "public"."public_echoes" USING "btree" ("created_at" DESC);



CREATE INDEX "public_echoes_embedding_hnsw_idx" ON "public"."public_echoes" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "public_echoes_engagement_idx" ON "public"."public_echoes" USING "btree" ("likes_count" DESC, "comment_count" DESC, "repost_count" DESC, "created_at" DESC);



CREATE INDEX "public_echoes_parent_idx" ON "public"."public_echoes" USING "btree" ("parent_echo_id") WHERE ("parent_echo_id" IS NOT NULL);



CREATE INDEX "public_echoes_perspective_type_idx" ON "public"."public_echoes" USING "btree" ("perspective_type") WHERE ("parent_echo_id" IS NOT NULL);



CREATE INDEX "public_echoes_remix_root_idx" ON "public"."public_echoes" USING "btree" ("remix_root_id") WHERE ("remix_root_id" IS NOT NULL);



CREATE INDEX "public_echoes_thoughtfulness_idx" ON "public"."public_echoes" USING "btree" ("thoughtfulness_score" DESC, "created_at" DESC);



CREATE INDEX "rag_embedding_messages_embedding_idx" ON "public"."rag_embedding_messages" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "reports_reporter_idx" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "reports_reporter_type_idx" ON "public"."reports" USING "btree" ("reporter_id", "target_type");



CREATE INDEX "reports_status_created_idx" ON "public"."reports" USING "btree" ("status", "created_at");



CREATE INDEX "reports_target_idx" ON "public"."reports" USING "btree" ("target_id");



CREATE INDEX "task_item_user_open_idx" ON "public"."task_item" USING "btree" ("user_id", "done", "due");



CREATE UNIQUE INDEX "trending_echoes_mv_id_idx" ON "public"."trending_echoes_mv" USING "btree" ("id");



CREATE INDEX "trending_echoes_mv_score_idx" ON "public"."trending_echoes_mv" USING "btree" ("global_score" DESC);



CREATE INDEX "user_devices_active_by_user" ON "public"."user_devices" USING "btree" ("user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "user_entitlements_plan_status_idx" ON "public"."user_entitlements" USING "btree" ("plan_id", "status");



CREATE UNIQUE INDEX "user_not_interested_author_uidx" ON "public"."user_not_interested" USING "btree" ("user_id", "author_id") WHERE ("author_id" IS NOT NULL);



CREATE UNIQUE INDEX "user_not_interested_echo_uidx" ON "public"."user_not_interested" USING "btree" ("user_id", "echo_id") WHERE ("echo_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "a_cap_user_devices" BEFORE INSERT ON "public"."user_devices" FOR EACH ROW EXECUTE FUNCTION "public"."cap_user_devices"();



CREATE OR REPLACE TRIGGER "a_enforce_dm_blocks" BEFORE INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_dm_blocks"();



CREATE OR REPLACE TRIGGER "a_enforce_dm_requests" BEFORE INSERT ON "public"."dm_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_dm_requests"();



CREATE OR REPLACE TRIGGER "a_enforce_group_adds" BEFORE INSERT ON "public"."dm_conversation_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_group_adds"();



CREATE OR REPLACE TRIGGER "a_guard_client_writes" BEFORE INSERT OR UPDATE ON "public"."ads" FOR EACH ROW EXECUTE FUNCTION "public"."guard_client_writes"();



CREATE OR REPLACE TRIGGER "a_guard_client_writes" BEFORE UPDATE ON "public"."dm_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_client_writes"();



CREATE OR REPLACE TRIGGER "a_guard_client_writes" BEFORE INSERT OR UPDATE ON "public"."learn_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."guard_client_writes"();



CREATE OR REPLACE TRIGGER "a_guard_client_writes" BEFORE INSERT OR UPDATE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."guard_client_writes"();



CREATE OR REPLACE TRIGGER "a_guard_listing_moderation" BEFORE INSERT OR UPDATE ON "public"."marketplace_listings" FOR EACH ROW EXECUTE FUNCTION "public"."guard_listing_moderation"();



CREATE OR REPLACE TRIGGER "a_keep_device_revoked" BEFORE UPDATE ON "public"."user_devices" FOR EACH ROW EXECUTE FUNCTION "public"."keep_device_revoked"();



CREATE OR REPLACE TRIGGER "ai_messages_touch" AFTER INSERT ON "public"."ai_messages" FOR EACH ROW EXECUTE FUNCTION "public"."ai_touch_conversation"();



CREATE OR REPLACE TRIGGER "appeals_overturned_restore" AFTER UPDATE ON "public"."appeals" FOR EACH ROW EXECUTE FUNCTION "public"."restore_content_on_overturned_appeal"();



CREATE OR REPLACE TRIGGER "appeals_resolved_notify" AFTER UPDATE ON "public"."appeals" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_appeal_resolved"();



CREATE OR REPLACE TRIGGER "b_guard_media_provenance" BEFORE INSERT OR UPDATE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."guard_media_provenance"();



CREATE OR REPLACE TRIGGER "b_validate_message_report" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."validate_message_report"();



CREATE OR REPLACE TRIGGER "c_hold_moderated_content" BEFORE UPDATE OF "check_content" ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."hold_moderated_content"();



CREATE OR REPLACE TRIGGER "d_bump_echo_content_version" BEFORE INSERT OR UPDATE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."bump_echo_content_version"();



CREATE OR REPLACE TRIGGER "daily_answers_keep_keys" BEFORE UPDATE ON "public"."daily_answers" FOR EACH ROW EXECUTE FUNCTION "public"."daily_answers_keep_keys"();



CREATE OR REPLACE TRIGGER "enforce_ad_payment_status" BEFORE INSERT OR UPDATE ON "public"."ads" FOR EACH ROW EXECUTE FUNCTION "public"."check_ad_payment_status"();



CREATE OR REPLACE TRIGGER "follows_adjust_follower_count" AFTER INSERT OR DELETE ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_follower_count"();



CREATE OR REPLACE TRIGGER "habit_touch_updated_at" BEFORE UPDATE ON "public"."habit" FOR EACH ROW EXECUTE FUNCTION "public"."touch_habit_updated_at"();



CREATE OR REPLACE TRIGGER "marketplace_listings_updated_at" BEFORE UPDATE ON "public"."marketplace_listings" FOR EACH ROW EXECUTE FUNCTION "public"."set_marketplace_updated_at"();



CREATE OR REPLACE TRIGGER "on_comment_like_change" AFTER INSERT OR DELETE ON "public"."comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_comment_likes_count"();



CREATE OR REPLACE TRIGGER "on_comment_notify" AFTER INSERT ON "public"."echo_comments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_comment"();



CREATE OR REPLACE TRIGGER "on_echo_comment_change" AFTER INSERT OR DELETE ON "public"."echo_comments" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_comment_count"();



CREATE OR REPLACE TRIGGER "on_echo_like_change" AFTER INSERT OR DELETE ON "public"."echo_likes" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_likes_count"();



CREATE OR REPLACE TRIGGER "on_echo_liked_notify" AFTER INSERT ON "public"."echo_likes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_echo_like"();



CREATE OR REPLACE TRIGGER "on_echo_repost_change" AFTER INSERT OR DELETE ON "public"."echo_reposts" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_repost_count"();



CREATE OR REPLACE TRIGGER "on_echo_unliked_cleanup" AFTER DELETE ON "public"."echo_likes" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_on_echo_unlike"();



CREATE OR REPLACE TRIGGER "on_echo_view_insert" AFTER INSERT ON "public"."echo_views" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_view_count"();



CREATE OR REPLACE TRIGGER "on_follow_notify" AFTER INSERT ON "public"."follows" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_follow"();



CREATE OR REPLACE TRIGGER "on_remix_change" AFTER INSERT OR DELETE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_remix_count"();



CREATE OR REPLACE TRIGGER "rate_limit_ai_messages_hour" BEFORE INSERT ON "public"."ai_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('ai_message_hour', '1000', '3600', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_comment_likes_minute" BEFORE INSERT ON "public"."comment_likes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('comment_like_minute', '60', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_daily_answers_hour" BEFORE INSERT ON "public"."daily_answers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('daily_answer_hour', '5', '3600', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_direct_messages_day" BEFORE INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('dm_message_day', '500', '86400', 'sender_id');



CREATE OR REPLACE TRIGGER "rate_limit_direct_messages_minute" BEFORE INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('dm_message_minute', '30', '60', 'sender_id');



CREATE OR REPLACE TRIGGER "rate_limit_dm_conversations_day" AFTER INSERT ON "public"."dm_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('dm_conversation_day', '30', '86400', 'auth.uid');



CREATE OR REPLACE TRIGGER "rate_limit_echo_bookmarks_minute" BEFORE INSERT ON "public"."echo_bookmarks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('echo_bookmark_minute', '40', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_comments_day" BEFORE INSERT ON "public"."echo_comments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('comment_day', '200', '86400', 'author_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_comments_minute" BEFORE INSERT ON "public"."echo_comments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('comment_minute', '8', '60', 'author_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_likes_minute" BEFORE INSERT ON "public"."echo_likes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('echo_like_minute', '60', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_reactions_minute" BEFORE INSERT ON "public"."echo_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('echo_reaction_minute', '80', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_reposts_minute" BEFORE INSERT ON "public"."echo_reposts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('echo_repost_minute', '20', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_echo_views_minute" BEFORE INSERT ON "public"."echo_views" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('echo_view_minute', '240', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_follow_requests_hour" BEFORE INSERT ON "public"."follow_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('follow_request_hour', '60', '3600', 'requester_id');



CREATE OR REPLACE TRIGGER "rate_limit_follows_day" BEFORE INSERT ON "public"."follows" FOR EACH ROW WHEN (("current_setting"('echo.approving_follow'::"text", true) IS DISTINCT FROM '1'::"text")) EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('follow_day', '200', '86400', 'follower_id');



CREATE OR REPLACE TRIGGER "rate_limit_follows_hour" BEFORE INSERT ON "public"."follows" FOR EACH ROW WHEN (("current_setting"('echo.approving_follow'::"text", true) IS DISTINCT FROM '1'::"text")) EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('follow_hour', '60', '3600', 'follower_id');



CREATE OR REPLACE TRIGGER "rate_limit_marketplace_listings_hour" BEFORE INSERT ON "public"."marketplace_listings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('marketplace_listing_hour', '20', '3600', 'seller_id');



CREATE OR REPLACE TRIGGER "rate_limit_message_reactions_minute" BEFORE INSERT ON "public"."message_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('message_reaction_minute', '80', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_office_hour_question_upvotes_minute" BEFORE INSERT ON "public"."office_hour_question_upvotes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('office_hour_question_upvote_minute', '60', '60', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_office_hour_questions_hour" BEFORE INSERT ON "public"."office_hour_questions" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('office_hour_question_hour', '12', '3600', 'asker_id');



CREATE OR REPLACE TRIGGER "rate_limit_office_hour_rsvps_hour" BEFORE INSERT ON "public"."office_hour_rsvps" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('office_hour_rsvp_hour', '40', '3600', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_office_hours_day" BEFORE INSERT ON "public"."office_hours" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('office_hour_create_day', '10', '86400', 'host_id');



CREATE OR REPLACE TRIGGER "rate_limit_profiles_update_hour" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_profile_update_rate_limit"();



CREATE OR REPLACE TRIGGER "rate_limit_public_echoes_day" BEFORE INSERT ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('publish_echo_day', '40', '86400', 'author_id');



CREATE OR REPLACE TRIGGER "rate_limit_public_echoes_hour" BEFORE INSERT ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('publish_echo_hour', '12', '3600', 'author_id');



CREATE OR REPLACE TRIGGER "rate_limit_push_tokens_hour" BEFORE INSERT ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('push_token_hour', '60', '3600', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_reports_day" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('report_day', '30', '86400', 'reporter_id');



CREATE OR REPLACE TRIGGER "rate_limit_salon_members_hour" BEFORE INSERT ON "public"."salon_members" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('salon_join_hour', '40', '3600', 'user_id');



CREATE OR REPLACE TRIGGER "rate_limit_salons_day" BEFORE INSERT ON "public"."salons" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('salon_create_day', '5', '86400', 'owner_id');



CREATE OR REPLACE TRIGGER "rate_limit_user_blocks_hour" BEFORE INSERT ON "public"."user_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('block_hour', '100', '3600', 'blocker_id');



CREATE OR REPLACE TRIGGER "rate_limit_user_devices_day" BEFORE INSERT ON "public"."user_devices" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_insert_rate_limit"('e2ee_device_day', '10', '86400', 'user_id');



CREATE OR REPLACE TRIGGER "release_follow_requests" AFTER UPDATE OF "is_private" ON "public"."profiles" FOR EACH ROW WHEN ((("old"."is_private" IS TRUE) AND ("new"."is_private" IS NOT TRUE))) EXECUTE FUNCTION "public"."release_follow_requests"();



CREATE OR REPLACE TRIGGER "set_remix_lineage" BEFORE INSERT ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_remix_lineage"();



CREATE OR REPLACE TRIGGER "trg_act_on_urgent_report" BEFORE INSERT ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."act_on_urgent_report"();



CREATE OR REPLACE TRIGGER "trg_add_salon_owner" AFTER INSERT ON "public"."salons" FOR EACH ROW EXECUTE FUNCTION "public"."add_salon_owner_as_member"();



CREATE OR REPLACE TRIGGER "trg_bump_quote_repost_count" AFTER INSERT OR DELETE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."bump_quote_repost_count"();



CREATE OR REPLACE TRIGGER "trg_comment_reaction_count" AFTER INSERT OR DELETE ON "public"."comment_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_comment_reaction_count"();



CREATE OR REPLACE TRIGGER "trg_conv_last_message" AFTER INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_conv_last_message"();



CREATE OR REPLACE TRIGGER "trg_daily_reaction_notify" AFTER INSERT ON "public"."daily_answer_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_daily_reaction_notify"();



CREATE OR REPLACE TRIGGER "trg_dm_push_notify" AFTER INSERT ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_dm_push_notify"();



CREATE OR REPLACE TRIGGER "trg_echo_reaction_count" AFTER INSERT OR DELETE ON "public"."echo_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_echo_reaction_count"();



CREATE OR REPLACE TRIGGER "trg_enforce_minor_profiling_off" BEFORE INSERT OR UPDATE OF "personalized_notifications" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_minor_profiling_off"();



CREATE OR REPLACE TRIGGER "trg_friend_daily_answer_notify" AFTER INSERT ON "public"."daily_answers" FOR EACH ROW EXECUTE FUNCTION "public"."fn_friend_daily_answer_notify"();



CREATE OR REPLACE TRIGGER "trg_friend_post_notify" AFTER INSERT ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_friend_post_notify"();



CREATE OR REPLACE TRIGGER "trg_learn_booking_requires_party" BEFORE INSERT ON "public"."learn_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_learn_booking_requires_party"();



CREATE OR REPLACE TRIGGER "trg_moderate_avatar" AFTER INSERT OR UPDATE OF "avatar_url" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."moderate_avatar"();



CREATE OR REPLACE TRIGGER "trg_moderate_listing" AFTER INSERT OR UPDATE OF "title", "description", "photo_urls", "tags" ON "public"."marketplace_listings" FOR EACH ROW EXECUTE FUNCTION "public"."moderate_listing"();



CREATE OR REPLACE TRIGGER "trg_moderate_new_echo" AFTER INSERT OR UPDATE OF "title", "prompt", "response", "media_urls" ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."moderate_new_echo"();



CREATE OR REPLACE TRIGGER "trg_notifications_push_fanout" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."fanout_push_on_notification"();



CREATE OR REPLACE TRIGGER "trg_notify_comment_mention" AFTER INSERT ON "public"."comment_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_comment_mention"();



CREATE OR REPLACE TRIGGER "trg_notify_echo_bookmark" AFTER INSERT ON "public"."echo_bookmarks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_echo_bookmark"();



CREATE OR REPLACE TRIGGER "trg_notify_echo_mention" AFTER INSERT ON "public"."echo_mentions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_echo_mention"();



CREATE OR REPLACE TRIGGER "trg_notify_echo_quote" AFTER INSERT ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_echo_quote"();



CREATE OR REPLACE TRIGGER "trg_notify_echo_reaction" AFTER INSERT ON "public"."echo_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_echo_reaction"();



CREATE OR REPLACE TRIGGER "trg_oh_question_upvote_count" AFTER INSERT OR DELETE ON "public"."office_hour_question_upvotes" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_oh_question_upvote_count"();



CREATE OR REPLACE TRIGGER "trg_oh_rsvp_count" AFTER INSERT OR DELETE ON "public"."office_hour_rsvps" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_oh_rsvp_count"();



CREATE OR REPLACE TRIGGER "trg_report_resolution_notification" AFTER UPDATE OF "status" ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."notify_reporter_on_resolution"();



CREATE OR REPLACE TRIGGER "trg_restore_on_dismissed_urgent_report" AFTER UPDATE OF "status" ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."restore_on_dismissed_urgent_report"();



CREATE OR REPLACE TRIGGER "trg_salon_echo_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."public_echoes" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_salon_echo_count"();



CREATE OR REPLACE TRIGGER "trg_salon_member_count" AFTER INSERT OR DELETE ON "public"."salon_members" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_salon_member_count"();



CREATE OR REPLACE TRIGGER "trg_social_task_notify" AFTER UPDATE ON "public"."task_item" FOR EACH ROW EXECUTE FUNCTION "public"."fn_social_task_notify"();



CREATE OR REPLACE TRIGGER "trg_touch_dm_on_reaction" AFTER INSERT OR DELETE ON "public"."message_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_dm_on_reaction"();



CREATE OR REPLACE TRIGGER "trg_validate_date_of_birth" BEFORE INSERT OR UPDATE OF "date_of_birth", "personalized_notifications" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_date_of_birth"();



CREATE OR REPLACE TRIGGER "z_scrub_deleted_dm" BEFORE UPDATE ON "public"."direct_messages" FOR EACH ROW EXECUTE FUNCTION "public"."scrub_deleted_dm"();



ALTER TABLE ONLY "public"."ad_events"
    ADD CONSTRAINT "ad_events_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ad_events"
    ADD CONSTRAINT "ad_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ads"
    ADD CONSTRAINT "ads_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_messages"
    ADD CONSTRAINT "ai_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_rate_limits"
    ADD CONSTRAINT "ai_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_tool_calls"
    ADD CONSTRAINT "ai_tool_calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_tool_calls"
    ADD CONSTRAINT "ai_tool_calls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_tool_calls"
    ADD CONSTRAINT "ai_tool_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_rate_limits"
    ADD CONSTRAINT "app_rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appeals"
    ADD CONSTRAINT "appeals_appellant_id_fkey" FOREIGN KEY ("appellant_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appeals"
    ADD CONSTRAINT "appeals_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "public"."moderation_decisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appeals"
    ADD CONSTRAINT "appeals_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookmark_collections"
    ADD CONSTRAINT "bookmark_collections_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_runs"
    ADD CONSTRAINT "broadcast_runs_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."daily_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."echo_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_likes"
    ADD CONSTRAINT "comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."echo_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_mentions"
    ADD CONSTRAINT "comment_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."echo_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comment_reactions"
    ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_answer_reactions"
    ADD CONSTRAINT "daily_answer_reactions_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "public"."daily_answers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_answer_reactions"
    ADD CONSTRAINT "daily_answer_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."daily_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_answers"
    ADD CONSTRAINT "daily_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_message_keys"
    ADD CONSTRAINT "direct_message_keys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."user_devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_message_keys"
    ADD CONSTRAINT "direct_message_keys_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."direct_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_shared_echo_id_fkey" FOREIGN KEY ("shared_echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_conversation_members"
    ADD CONSTRAINT "dm_conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_conversation_members"
    ADD CONSTRAINT "dm_conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pinned_message_id_fkey" FOREIGN KEY ("pinned_message_id") REFERENCES "public"."direct_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_prefs"
    ADD CONSTRAINT "dm_prefs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_prefs"
    ADD CONSTRAINT "dm_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_bookmarks"
    ADD CONSTRAINT "echo_bookmarks_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."bookmark_collections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."echo_bookmarks"
    ADD CONSTRAINT "echo_bookmarks_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_bookmarks"
    ADD CONSTRAINT "echo_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_comments"
    ADD CONSTRAINT "echo_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_comments"
    ADD CONSTRAINT "echo_comments_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_comments"
    ADD CONSTRAINT "echo_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."echo_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_likes"
    ADD CONSTRAINT "echo_likes_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_likes"
    ADD CONSTRAINT "echo_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_mentions"
    ADD CONSTRAINT "echo_mentions_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_mentions"
    ADD CONSTRAINT "echo_mentions_mentioned_user_id_fkey" FOREIGN KEY ("mentioned_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_reactions"
    ADD CONSTRAINT "echo_reactions_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_reactions"
    ADD CONSTRAINT "echo_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_reposts"
    ADD CONSTRAINT "echo_reposts_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_reposts"
    ADD CONSTRAINT "echo_reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_views"
    ADD CONSTRAINT "echo_views_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."echo_views"
    ADD CONSTRAINT "echo_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_settings"
    ADD CONSTRAINT "expense_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_tx"
    ADD CONSTRAINT "expense_tx_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_goals"
    ADD CONSTRAINT "fitness_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_meal"
    ADD CONSTRAINT "fitness_meal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_measurement"
    ADD CONSTRAINT "fitness_measurement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_water"
    ADD CONSTRAINT "fitness_water_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_weight"
    ADD CONSTRAINT "fitness_weight_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fitness_workout"
    ADD CONSTRAINT "fitness_workout_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follow_requests"
    ADD CONSTRAINT "follow_requests_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit_entry"
    ADD CONSTRAINT "habit_entry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit_entry"
    ADD CONSTRAINT "habit_entry_user_id_habit_client_id_fkey" FOREIGN KEY ("user_id", "habit_client_id") REFERENCES "public"."habit"("user_id", "client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."habit"
    ADD CONSTRAINT "habit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."learn_packages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."learn_slots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."learn_bookings"
    ADD CONSTRAINT "learn_bookings_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."learn_tutors"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_lecture_notes"
    ADD CONSTRAINT "learn_lecture_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_lecture_notes"
    ADD CONSTRAINT "learn_lecture_notes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."learn_bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_lecture_notes"
    ADD CONSTRAINT "learn_lecture_notes_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "public"."learn_lectures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_lectures"
    ADD CONSTRAINT "learn_lectures_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_packages"
    ADD CONSTRAINT "learn_packages_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."learn_tutors"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_slots"
    ADD CONSTRAINT "learn_slots_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."learn_tutors"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learn_tutors"
    ADD CONSTRAINT "learn_tutors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mini_app_data"
    ADD CONSTRAINT "mini_app_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mini_app_share"
    ADD CONSTRAINT "mini_app_share_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_profiles"
    ADD CONSTRAINT "notification_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_profiles"
    ADD CONSTRAINT "notification_profiles_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_question_upvotes"
    ADD CONSTRAINT "office_hour_question_upvotes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."office_hour_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_question_upvotes"
    ADD CONSTRAINT "office_hour_question_upvotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_questions"
    ADD CONSTRAINT "office_hour_questions_asker_id_fkey" FOREIGN KEY ("asker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_questions"
    ADD CONSTRAINT "office_hour_questions_office_hour_id_fkey" FOREIGN KEY ("office_hour_id") REFERENCES "public"."office_hours"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_rsvps"
    ADD CONSTRAINT "office_hour_rsvps_office_hour_id_fkey" FOREIGN KEY ("office_hour_id") REFERENCES "public"."office_hours"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hour_rsvps"
    ADD CONSTRAINT "office_hour_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."office_hours"
    ADD CONSTRAINT "office_hours_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pinned_echo_id_fkey" FOREIGN KEY ("pinned_echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_co_author_id_fkey" FOREIGN KEY ("co_author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_parent_echo_id_fkey" FOREIGN KEY ("parent_echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_quoted_echo_id_fkey" FOREIGN KEY ("quoted_echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_remix_root_id_fkey" FOREIGN KEY ("remix_root_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_echoes"
    ADD CONSTRAINT "public_echoes_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_reward_badge_id_fkey" FOREIGN KEY ("reward_badge_id") REFERENCES "public"."badges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rules_notices"
    ADD CONSTRAINT "rules_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salon_members"
    ADD CONSTRAINT "salon_members_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salon_members"
    ADD CONSTRAINT "salon_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salons"
    ADD CONSTRAINT "salons_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_item"
    ADD CONSTRAINT "task_item_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."thinking_fingerprints"
    ADD CONSTRAINT "thinking_fingerprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_auras"
    ADD CONSTRAINT "user_auras_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_entitlements"
    ADD CONSTRAINT "user_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_interests"
    ADD CONSTRAINT "user_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_mutes"
    ADD CONSTRAINT "user_mutes_muted_id_fkey" FOREIGN KEY ("muted_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_mutes"
    ADD CONSTRAINT "user_mutes_muter_id_fkey" FOREIGN KEY ("muter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_not_interested"
    ADD CONSTRAINT "user_not_interested_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_not_interested"
    ADD CONSTRAINT "user_not_interested_echo_id_fkey" FOREIGN KEY ("echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_not_interested"
    ADD CONSTRAINT "user_not_interested_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quests"
    ADD CONSTRAINT "user_quests_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quests"
    ADD CONSTRAINT "user_quests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_taste"
    ADD CONSTRAINT "user_taste_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verification_requests"
    ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_link_codes"
    ADD CONSTRAINT "whatsapp_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_links"
    ADD CONSTRAINT "whatsapp_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."year_wraps"
    ADD CONSTRAINT "year_wraps_top_echo_id_fkey" FOREIGN KEY ("top_echo_id") REFERENCES "public"."public_echoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."year_wraps"
    ADD CONSTRAINT "year_wraps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Active ads are viewable by everyone" ON "public"."ads" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Advertisers can manage their own ads" ON "public"."ads" USING ((( SELECT "auth"."uid"() AS "uid") = "advertiser_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "advertiser_id"));



CREATE POLICY "Anon can read profiles" ON "public"."profiles" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Anon reads public moderated echoes" ON "public"."public_echoes" FOR SELECT TO "anon" USING (("check_content" AND "public"."can_view_echo_author"("author_id")));



CREATE POLICY "Auras are viewable based on privacy and expiration" ON "public"."user_auras" FOR SELECT USING ((("expires_at" > "now"()) AND (("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("privacy" = 'public'::"text") OR (("privacy" = 'mutuals'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."follows" "f1"
     JOIN "public"."follows" "f2" ON ((("f1"."follower_id" = "f2"."following_id") AND ("f1"."following_id" = "f2"."follower_id"))))
  WHERE (("f1"."follower_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("f1"."following_id" = "user_auras"."user_id"))))))));



CREATE POLICY "Comments are viewable by authorized users" ON "public"."echo_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "e"
  WHERE ("e"."id" = "echo_comments"."echo_id"))));



CREATE POLICY "Echoes are viewable by authorized users" ON "public"."public_echoes" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "author_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "public_echoes"."author_id") AND ("p"."is_private" = false)))) OR (EXISTS ( SELECT 1
   FROM "public"."follows" "f"
  WHERE (("f"."follower_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("f"."following_id" = "public_echoes"."author_id"))))));



CREATE POLICY "Likes are viewable by authorized users" ON "public"."echo_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "e"
  WHERE ("e"."id" = "echo_likes"."echo_id"))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can delete own echoes" ON "public"."public_echoes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can delete their own auras" ON "public"."user_auras" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own echoes" ON "public"."public_echoes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND ("is_verified" = false) AND ("follower_count" = 0) AND ("push_token" IS NULL) AND (("pinned_echo_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."public_echoes" "pe"
  WHERE (("pe"."id" = "profiles"."pinned_echo_id") AND ("pe"."author_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users can insert their own auras" ON "public"."user_auras" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read their own AI limit" ON "public"."ai_rate_limits" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own echoes" ON "public"."public_echoes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND (NOT ("is_verified" IS DISTINCT FROM ( SELECT "profiles_1"."is_verified"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) AND (NOT ("is_moderator" IS DISTINCT FROM ( SELECT "profiles_1"."is_moderator"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) AND (NOT ("follower_count" IS DISTINCT FROM ( SELECT "profiles_1"."follower_count"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())))) AND (("pinned_echo_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."public_echoes" "pe"
  WHERE (("pe"."id" = "profiles"."pinned_echo_id") AND ("pe"."author_id" = "auth"."uid"())))))));



CREATE POLICY "Users can update their own auras" ON "public"."user_auras" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own bookmarks" ON "public"."echo_bookmarks" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own comment likes" ON "public"."comment_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own comments" ON "public"."echo_comments" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users delete own follows" ON "public"."follows" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users delete own likes" ON "public"."echo_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own reposts" ON "public"."echo_reposts" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own bookmarks" ON "public"."echo_bookmarks" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own comment likes" ON "public"."comment_likes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own comments" ON "public"."echo_comments" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "author_id"));



CREATE POLICY "Users insert own echo views" ON "public"."echo_views" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own follows" ON "public"."follows" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "follower_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "follows"."following_id") AND "p"."is_private"))))));



CREATE POLICY "Users insert own likes" ON "public"."echo_likes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert own reports" ON "public"."reports" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



CREATE POLICY "Users insert own reposts" ON "public"."echo_reposts" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read own reports" ON "public"."reports" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



CREATE POLICY "Users view own bookmarks" ON "public"."echo_bookmarks" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users view own echo_views rows" ON "public"."echo_views" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."ad_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_conv_owner" ON "public"."ai_conversations" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_msg_owner" ON "public"."ai_messages" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."ai_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_tool_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_tool_owner" ON "public"."ai_tool_calls" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "anon reads published packages" ON "public"."learn_packages" FOR SELECT TO "anon" USING (("is_active" AND (EXISTS ( SELECT 1
   FROM "public"."learn_tutors" "t"
  WHERE (("t"."user_id" = "learn_packages"."tutor_id") AND "t"."is_published" AND ("t"."public_slug" IS NOT NULL))))));



CREATE POLICY "anon reads published slots" ON "public"."learn_slots" FOR SELECT TO "anon" USING (("is_active" AND (EXISTS ( SELECT 1
   FROM "public"."learn_tutors" "t"
  WHERE (("t"."user_id" = "learn_slots"."tutor_id") AND "t"."is_published" AND ("t"."public_slug" IS NOT NULL))))));



CREATE POLICY "anon reads published tutors" ON "public"."learn_tutors" FOR SELECT TO "anon" USING (("is_published" AND ("public_slug" IS NOT NULL)));



CREATE POLICY "anyone reads feature flags" ON "public"."feature_flags" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."app_rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_rate_limits_select_own" ON "public"."app_rate_limits" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."appeals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appellants insert" ON "public"."appeals" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "appellant_id") AND (EXISTS ( SELECT 1
   FROM "public"."reports" "r"
  WHERE (("r"."id" = "appeals"."report_id") AND ("r"."reporter_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."status" = ANY (ARRAY['resolved'::"text", 'dismissed'::"text"])))))));



CREATE POLICY "appellants read own" ON "public"."appeals" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "appellant_id"));



ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badges select all" ON "public"."badges" FOR SELECT USING (true);



CREATE POLICY "bm_coll_delete_own" ON "public"."bookmark_collections" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "bm_coll_insert_own" ON "public"."bookmark_collections" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "bm_coll_select_own" ON "public"."bookmark_collections" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "bm_coll_update_own" ON "public"."bookmark_collections" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "booking parties read" ON "public"."learn_bookings" FOR SELECT TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("learner_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "booking parties update" ON "public"."learn_bookings" FOR UPDATE TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("learner_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("learner_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."bookmark_collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcast_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "call participants only" ON "public"."calls" USING (((( SELECT "auth"."uid"() AS "uid") = "caller_id") OR (( SELECT "auth"."uid"() AS "uid") = "callee_id")));



ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_likes follow comment visibility" ON "public"."comment_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."echo_comments" "c"
  WHERE ("c"."id" = "comment_likes"."comment_id"))));



ALTER TABLE "public"."comment_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_mentions follow comment visibility" ON "public"."comment_mentions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."echo_comments" "c"
  WHERE ("c"."id" = "comment_mentions"."comment_id"))));



CREATE POLICY "comment_mentions insert by author" ON "public"."comment_mentions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."echo_comments" "ec"
  WHERE (("ec"."id" = "comment_mentions"."comment_id") AND ("ec"."author_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."comment_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comment_reactions delete own" ON "public"."comment_reactions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "comment_reactions follow comment visibility" ON "public"."comment_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."echo_comments" "c"
  WHERE ("c"."id" = "comment_reactions"."comment_id"))));



CREATE POLICY "comment_reactions insert own" ON "public"."comment_reactions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."daily_answer_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_answer_reactions delete own" ON "public"."daily_answer_reactions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "daily_answer_reactions follow answer visibility" ON "public"."daily_answer_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."daily_answers" "a"
  WHERE ("a"."id" = "daily_answer_reactions"."answer_id"))));



CREATE POLICY "daily_answer_reactions insert own" ON "public"."daily_answer_reactions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."daily_answers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_answers delete own" ON "public"."daily_answers" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "daily_answers insert own" ON "public"."daily_answers" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "daily_answers readable by authorized users" ON "public"."daily_answers" FOR SELECT USING ("public"."can_view_echo_author"("user_id"));



CREATE POLICY "daily_answers update own" ON "public"."daily_answers" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."daily_question_bank" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_question_bank_read" ON "public"."daily_question_bank" FOR SELECT USING (true);



ALTER TABLE "public"."daily_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_questions select all" ON "public"."daily_questions" FOR SELECT USING (true);



ALTER TABLE "public"."direct_message_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_conv_insert_participant" ON "public"."dm_conversations" FOR INSERT WITH CHECK ((((COALESCE("is_group", false) = false) AND ((( SELECT "auth"."uid"() AS "uid") = "user_a") OR (( SELECT "auth"."uid"() AS "uid") = "user_b"))) OR ((COALESCE("is_group", false) = true) AND (( SELECT "auth"."uid"() AS "uid") = "created_by"))));



CREATE POLICY "dm_conv_select_participants" ON "public"."dm_conversations" FOR SELECT USING ("public"."is_dm_conversation_member"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dm_conv_update_participants" ON "public"."dm_conversations" FOR UPDATE USING ("public"."is_dm_conversation_member"("id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."dm_conversation_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_delete_self" ON "public"."direct_messages" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "sender_id"));



CREATE POLICY "dm_insert_self" ON "public"."direct_messages" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND "public"."is_dm_conversation_member"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "dm_keys_insert_by_sender" ON "public"."direct_message_keys" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."direct_messages" "m"
  WHERE (("m"."id" = "direct_message_keys"."message_id") AND ("m"."sender_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND (EXISTS ( SELECT 1
   FROM "public"."user_devices" "d"
  WHERE (("d"."id" = "direct_message_keys"."device_id") AND ("d"."revoked_at" IS NULL))))));



CREATE POLICY "dm_keys_select_own_device" ON "public"."direct_message_keys" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_devices" "d"
  WHERE (("d"."id" = "direct_message_keys"."device_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "dm_members_delete_self_or_admin" ON "public"."dm_conversation_members" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."dm_conversation_members" "m"
  WHERE (("m"."conversation_id" = "dm_conversation_members"."conversation_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'admin'::"text"))))));



CREATE POLICY "dm_members_insert_admin" ON "public"."dm_conversation_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."dm_conversation_members" "m"
  WHERE (("m"."conversation_id" = "dm_conversation_members"."conversation_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'admin'::"text")))));



CREATE POLICY "dm_members_select" ON "public"."dm_conversation_members" FOR SELECT USING ("public"."is_dm_conversation_member"("conversation_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."dm_prefs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_select_participants" ON "public"."direct_messages" FOR SELECT USING ("public"."is_dm_conversation_member"("conversation_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "dm_update_self" ON "public"."direct_messages" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "sender_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "sender_id"));



ALTER TABLE "public"."echo_bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."echo_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."echo_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."echo_mentions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "echo_mentions delete by author" ON "public"."echo_mentions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "pe"
  WHERE (("pe"."id" = "echo_mentions"."echo_id") AND ("pe"."author_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "echo_mentions follow echo visibility" ON "public"."echo_mentions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "e"
  WHERE ("e"."id" = "echo_mentions"."echo_id"))));



CREATE POLICY "echo_mentions insert by author" ON "public"."echo_mentions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "pe"
  WHERE (("pe"."id" = "echo_mentions"."echo_id") AND ("pe"."author_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."echo_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "echo_reactions delete own" ON "public"."echo_reactions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "echo_reactions follow echo visibility" ON "public"."echo_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "e"
  WHERE ("e"."id" = "echo_reactions"."echo_id"))));



CREATE POLICY "echo_reactions insert own" ON "public"."echo_reactions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."echo_reposts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "echo_reposts follow echo visibility" ON "public"."echo_reposts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_echoes" "e"
  WHERE ("e"."id" = "echo_reposts"."echo_id"))));



ALTER TABLE "public"."echo_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."erasure_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_tx" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_meal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_measurement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_water" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_weight" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fitness_workout" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."follow_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follow_requests_select_own" ON "public"."follow_requests" FOR SELECT TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("target_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "follows require both parties visible" ON "public"."follows" FOR SELECT USING (("public"."can_view_echo_author"("follower_id") AND "public"."can_view_echo_author"("following_id")));



ALTER TABLE "public"."habit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."habit_entry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_lecture_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_lectures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learn_tutors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "learner requests a booking" ON "public"."learn_bookings" FOR INSERT TO "authenticated" WITH CHECK ((("learner_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."learn_tutors" "t"
  WHERE (("t"."user_id" = "learn_bookings"."tutor_id") AND "t"."is_published")))));



CREATE POLICY "lecture visibility" ON "public"."learn_lectures" FOR SELECT TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("visibility" = 'public'::"text") OR (("visibility" = 'learners'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."learn_bookings" "b"
  WHERE (("b"."tutor_id" = "learn_lectures"."owner_id") AND ("b"."learner_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."status" = ANY (ARRAY['accepted'::"text", 'scheduled'::"text", 'completed'::"text"]))))))));



ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_url_hosts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mini_app_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mini_app_share" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_decisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moderators read all appeals" ON "public"."appeals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_moderator" = true)))));



CREATE POLICY "moderators read all decisions" ON "public"."moderation_decisions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_moderator" = true)))));



CREATE POLICY "moderators read verification queue" ON "public"."verification_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_moderator" = true)))));



CREATE POLICY "moderators update appeals" ON "public"."appeals" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_moderator" = true)))));



ALTER TABLE "public"."notification_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_profiles rw own" ON "public"."notification_profiles" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."office_hour_question_upvotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."office_hour_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."office_hour_rsvps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."office_hours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "office_hours delete host" ON "public"."office_hours" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "host_id"));



CREATE POLICY "office_hours follow host visibility" ON "public"."office_hours" FOR SELECT USING ("public"."can_view_echo_author"("host_id"));



CREATE POLICY "office_hours insert host" ON "public"."office_hours" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "host_id"));



CREATE POLICY "office_hours update host" ON "public"."office_hours" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "host_id"));



CREATE POLICY "oh_questions follow asker visibility" ON "public"."office_hour_questions" FOR SELECT USING ("public"."can_view_echo_author"("asker_id"));



CREATE POLICY "oh_questions insert own" ON "public"."office_hour_questions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "asker_id"));



CREATE POLICY "oh_questions update host_or_asker" ON "public"."office_hour_questions" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "asker_id") OR (EXISTS ( SELECT 1
   FROM "public"."office_hours" "oh"
  WHERE (("oh"."id" = "office_hour_questions"."office_hour_id") AND ("oh"."host_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "oh_rsvps delete own" ON "public"."office_hour_rsvps" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "oh_rsvps follow attendee visibility" ON "public"."office_hour_rsvps" FOR SELECT USING ("public"."can_view_echo_author"("user_id"));



CREATE POLICY "oh_rsvps insert own" ON "public"."office_hour_rsvps" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "oh_upvotes delete own" ON "public"."office_hour_question_upvotes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "oh_upvotes follow voter visibility" ON "public"."office_hour_question_upvotes" FOR SELECT USING ("public"."can_view_echo_author"("user_id"));



CREATE POLICY "oh_upvotes insert own" ON "public"."office_hour_question_upvotes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own dm prefs — delete" ON "public"."dm_prefs" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own dm prefs — insert" ON "public"."dm_prefs" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own dm prefs — select" ON "public"."dm_prefs" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own dm prefs — update" ON "public"."dm_prefs" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_settings — delete" ON "public"."expense_settings" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_settings — insert" ON "public"."expense_settings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_settings — select" ON "public"."expense_settings" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_settings — update" ON "public"."expense_settings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_tx — delete" ON "public"."expense_tx" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_tx — insert" ON "public"."expense_tx" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_tx — select" ON "public"."expense_tx" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own expense_tx — update" ON "public"."expense_tx" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_goals — delete" ON "public"."fitness_goals" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_goals — insert" ON "public"."fitness_goals" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_goals — select" ON "public"."fitness_goals" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_goals — update" ON "public"."fitness_goals" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_meal — delete" ON "public"."fitness_meal" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_meal — insert" ON "public"."fitness_meal" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_meal — select" ON "public"."fitness_meal" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_meal — update" ON "public"."fitness_meal" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_measurement — delete" ON "public"."fitness_measurement" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_measurement — insert" ON "public"."fitness_measurement" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_measurement — select" ON "public"."fitness_measurement" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_measurement — update" ON "public"."fitness_measurement" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_water — delete" ON "public"."fitness_water" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_water — insert" ON "public"."fitness_water" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_water — select" ON "public"."fitness_water" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_water — update" ON "public"."fitness_water" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_weight — delete" ON "public"."fitness_weight" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_weight — insert" ON "public"."fitness_weight" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_weight — select" ON "public"."fitness_weight" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_weight — update" ON "public"."fitness_weight" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_workout — delete" ON "public"."fitness_workout" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_workout — insert" ON "public"."fitness_workout" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_workout — select" ON "public"."fitness_workout" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own fitness_workout — update" ON "public"."fitness_workout" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habit entries — delete" ON "public"."habit_entry" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habit entries — insert" ON "public"."habit_entry" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habit entries — select" ON "public"."habit_entry" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habit entries — update" ON "public"."habit_entry" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habits — delete" ON "public"."habit" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habits — insert" ON "public"."habit" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habits — select" ON "public"."habit" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own habits — update" ON "public"."habit" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own lectures write" ON "public"."learn_lectures" TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own link codes" ON "public"."whatsapp_link_codes" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own mini app data — delete" ON "public"."mini_app_data" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own mini app data — insert" ON "public"."mini_app_data" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own mini app data — select" ON "public"."mini_app_data" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own mini app data — update" ON "public"."mini_app_data" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own notes" ON "public"."learn_lecture_notes" TO "authenticated" USING (("author_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own packages write" ON "public"."learn_packages" TO "authenticated" USING (("tutor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("tutor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own push tokens delete" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own push tokens insert" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own push tokens select" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own push tokens update" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own share prefs — insert" ON "public"."mini_app_share" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own share prefs — select" ON "public"."mini_app_share" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own share prefs — update" ON "public"."mini_app_share" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own slots write" ON "public"."learn_slots" TO "authenticated" USING (("tutor_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("tutor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own tasks — delete" ON "public"."task_item" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own tasks — insert" ON "public"."task_item" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own tasks — select" ON "public"."task_item" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own tasks — update" ON "public"."task_item" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own tutor profile write" ON "public"."learn_tutors" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "own verification requests — select" ON "public"."verification_requests" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "own whatsapp link" ON "public"."whatsapp_links" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "packages of published tutors" ON "public"."learn_packages" FOR SELECT TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."learn_tutors" "t"
  WHERE (("t"."user_id" = "learn_packages"."tutor_id") AND "t"."is_published")))));



ALTER TABLE "public"."payment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."probe_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_breaker" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_echoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "published tutors are readable" ON "public"."learn_tutors" FOR SELECT TO "authenticated" USING (("is_published" OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quests select active" ON "public"."quests" FOR SELECT USING (true);



ALTER TABLE "public"."rag_embedding_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "react_delete" ON "public"."message_reactions" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "react_insert" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."direct_messages" "dm"
  WHERE (("dm"."id" = "message_reactions"."message_id") AND "public"."is_dm_conversation_member"("dm"."conversation_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "react_select" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."direct_messages" "dm"
  WHERE (("dm"."id" = "message_reactions"."message_id") AND "public"."is_dm_conversation_member"("dm"."conversation_id", ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "read active listings" ON "public"."marketplace_listings" FOR SELECT USING ((("status" = 'active'::"text") AND "check_content"));



ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rules_notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."salon_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salon_members delete self" ON "public"."salon_members" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "salon_members follow member visibility" ON "public"."salon_members" FOR SELECT USING ("public"."can_view_echo_author"("user_id"));



CREATE POLICY "salon_members insert self" ON "public"."salon_members" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."salons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salons delete owner" ON "public"."salons" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "salons insert owner" ON "public"."salons" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "salons select all" ON "public"."salons" FOR SELECT USING (true);



CREATE POLICY "salons update owner" ON "public"."salons" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "owner_id"));



CREATE POLICY "sellers delete own" ON "public"."marketplace_listings" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));



CREATE POLICY "sellers insert" ON "public"."marketplace_listings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));



CREATE POLICY "sellers read own" ON "public"."marketplace_listings" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));



CREATE POLICY "sellers update own" ON "public"."marketplace_listings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));



CREATE POLICY "slots of published tutors" ON "public"."learn_slots" FOR SELECT TO "authenticated" USING ((("tutor_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."learn_tutors" "t"
  WHERE (("t"."user_id" = "learn_slots"."tutor_id") AND "t"."is_published")))));



CREATE POLICY "subject reads own decisions" ON "public"."moderation_decisions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "subject_id"));



CREATE POLICY "subjects appeal own decision" ON "public"."appeals" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "appellant_id") AND ("decision_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."moderation_decisions" "md"
  WHERE (("md"."id" = "appeals"."decision_id") AND ("md"."subject_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("now"() < "md"."appeal_deadline"))))));



ALTER TABLE "public"."subscription_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_item" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."thinking_fingerprints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unlink own whatsapp" ON "public"."whatsapp_links" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_auras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_badges follow holder visibility" ON "public"."user_badges" FOR SELECT USING ("public"."can_view_echo_author"("user_id"));



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks_delete_own" ON "public"."user_blocks" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "blocker_id"));



CREATE POLICY "user_blocks_insert_own" ON "public"."user_blocks" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "blocker_id"));



CREATE POLICY "user_blocks_select_own" ON "public"."user_blocks" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "blocker_id"));



ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_devices_insert" ON "public"."user_devices" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("revoked_at" IS NULL)));



CREATE POLICY "user_devices_select" ON "public"."user_devices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_devices_update" ON "public"."user_devices" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_entitlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_entitlements_select_own" ON "public"."user_entitlements" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."user_interests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_interests_delete_own" ON "public"."user_interests" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_interests_insert_own" ON "public"."user_interests" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_interests_select_own" ON "public"."user_interests" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_mutes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_mutes_delete_own" ON "public"."user_mutes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "muter_id"));



CREATE POLICY "user_mutes_insert_own" ON "public"."user_mutes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "muter_id"));



CREATE POLICY "user_mutes_select_own" ON "public"."user_mutes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "muter_id"));



ALTER TABLE "public"."user_not_interested" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_not_interested rw own" ON "public"."user_not_interested" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."user_quests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_quests insert own" ON "public"."user_quests" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_quests select own" ON "public"."user_quests" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_quests update own" ON "public"."user_quests" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."user_taste" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_taste read own" ON "public"."user_taste" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."verification_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_link_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."year_wraps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "year_wraps select own" ON "public"."year_wraps" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."calls";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."act_on_urgent_report"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."act_on_urgent_report"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_member_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_member_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_group_members"("p_conversation_id" "uuid", "p_member_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_salon_owner_as_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_salon_owner_as_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_comment_likes_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_comment_likes_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_comment_reaction_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_comment_reaction_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_comment_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_comment_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_likes_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_likes_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_reaction_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_reaction_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_remix_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_remix_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_repost_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_repost_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_echo_view_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_echo_view_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_follower_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_follower_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_oh_question_upvote_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_oh_question_upvote_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_oh_rsvp_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_oh_rsvp_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_salon_echo_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_salon_echo_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_salon_member_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_salon_member_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."adult_age_years"() TO "anon";
GRANT ALL ON FUNCTION "public"."adult_age_years"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."adult_age_years"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ai_touch_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."ai_touch_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ai_touch_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."alt_texts_ok"("p" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."alt_texts_ok"("p" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."alt_texts_ok"("p" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_store_entitlement"("p_user" "uuid", "p_row" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_store_entitlement"("p_user" "uuid", "p_row" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_follow"("p_requester" "uuid", "p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_follow"("p_requester" "uuid", "p_target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assert_group_admin"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assert_group_admin"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_group_admin"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."breaker_record"("p_provider" "text", "p_ok" boolean, "p_retry_after" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."breaker_record"("p_provider" "text", "p_ok" boolean, "p_retry_after" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."breaker_state"("p_provider" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."breaker_state"("p_provider" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_echo_content_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_echo_content_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_quote_repost_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_quote_repost_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_be_profiled"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_be_profiled"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_be_profiled"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_echo_author"("p_author_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_follow_request"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_follow_request"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_follow_request"("p_target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cap_user_devices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cap_user_devices"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_ad_payment_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_ad_payment_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_ad_payment_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_app_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer, "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_app_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_app_rate_limit"("p_action" "text", "p_limit" integer, "p_window_seconds" integer, "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_daily_broadcast"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_daily_broadcast"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_nudges"("p_hour" integer, "p_limit" integer, "p_min_gap_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_nudges"("p_hour" integer, "p_limit" integer, "p_min_gap_hours" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_on_echo_unlike"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_on_echo_unlike"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_group_conversation"("p_title" "text", "p_member_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_title" "text", "p_member_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_title" "text", "p_member_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."cron_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cron_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_health_full"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_health_full"() TO "service_role";



GRANT ALL ON FUNCTION "public"."daily_answers_keep_keys"() TO "anon";
GRANT ALL ON FUNCTION "public"."daily_answers_keep_keys"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."daily_answers_keep_keys"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dm_blocked_between"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_blocked_between"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dm_request_allowed"("p_sender" "uuid", "p_recipient" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dm_request_allowed"("p_sender" "uuid", "p_recipient" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."echo_is_held"("p_echo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."echo_is_held"("p_echo_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_dm_blocks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_dm_blocks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_dm_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_dm_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_group_adds"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_group_adds"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_insert_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_insert_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_minor_profiling_off"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_minor_profiling_off"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_profile_update_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_profile_update_rate_limit"() TO "service_role";



GRANT ALL ON TABLE "public"."daily_questions" TO "anon";
GRANT ALL ON TABLE "public"."daily_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_questions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_daily_question"("target" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_daily_question"("target" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_daily_question"("target" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."erase_account_rows"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."erase_account_rows"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."expense_stats"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."expense_stats"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."expense_stats"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fanout_friend_post_batch"("p_echo_id" "uuid", "p_author_id" "uuid", "p_preview" "text", "p_after" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fanout_friend_post_batch"("p_echo_id" "uuid", "p_author_id" "uuid", "p_preview" "text", "p_after" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."fanout_push_on_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fanout_push_on_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."feed_base_score"("p_likes" integer, "p_comments" integer, "p_reposts" integer, "p_views" integer, "p_created_at" timestamp with time zone, "p_has_media" boolean) TO "anon";



GRANT ALL ON FUNCTION "public"."fitness_stats"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fitness_stats"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fitness_stats"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_daily_reaction_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_daily_reaction_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_dm_push_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dm_push_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_friend_daily_answer_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_friend_daily_answer_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_friend_post_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_friend_post_notify"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_learn_booking_requires_party"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_learn_booking_requires_party"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_learn_booking_requires_party"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_social_task_notify"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_social_task_notify"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_sync_conv_last_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sync_conv_last_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."following_fitness_leaderboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."following_fitness_leaderboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."following_fitness_leaderboard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."following_habit_leaderboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."following_habit_leaderboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."following_habit_leaderboard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_divergent_daily_answers"("p_question_id" "uuid", "p_viewer_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_divergent_daily_answers"("p_question_id" "uuid", "p_viewer_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_divergent_daily_answers"("p_question_id" "uuid", "p_viewer_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_dm_conversations"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_dm_conversations"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dm_conversations"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_group_members"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_rank"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_rank"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_rank"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_recipient_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_recipient_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_personal_feed"("p_user_id" "uuid", "p_limit" integer, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_session_seed" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_personal_feed"("p_user_id" "uuid", "p_limit" integer, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_session_seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personal_feed"("p_user_id" "uuid", "p_limit" integer, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_session_seed" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ranked_feed"("p_user_id" "uuid", "p_limit" integer, "p_gravity" double precision, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_following_only" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ranked_feed"("p_user_id" "uuid", "p_limit" integer, "p_gravity" double precision, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_following_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ranked_feed"("p_user_id" "uuid", "p_limit" integer, "p_gravity" double precision, "p_cursor_score" double precision, "p_cursor_id" "uuid", "p_following_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_remix_tree"("p_root_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_remix_tree"("p_root_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_remix_tree"("p_root_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_semantic_feed"("p_user_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_semantic_feed"("p_user_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_semantic_feed"("p_user_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_similar_echoes"("p_echo_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_similar_echoes"("p_echo_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_similar_echoes"("p_echo_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_thinking_partners"("p_user_id" "uuid", "p_limit" integer, "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_thinking_partners"("p_user_id" "uuid", "p_limit" integer, "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_thinking_partners"("p_user_id" "uuid", "p_limit" integer, "p_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_trending_evolutions"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_trending_evolutions"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trending_evolutions"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_client_writes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_client_writes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_listing_moderation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_listing_moderation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_media_provenance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_media_provenance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."habit_stats"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."habit_stats"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."habit_stats"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_remix_lineage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_remix_lineage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hold_moderated_content"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hold_moderated_content"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_ad_click"("ad_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_ad_click"("ad_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_ad_click"("ad_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_ad_view"("ad_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_ad_view"("ad_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_ad_view"("ad_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingest_revenuecat_event"("p_event" "jsonb", "p_users" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingest_revenuecat_event"("p_event" "jsonb", "p_users" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_adult"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_adult"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_adult"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_dm_conversation_member"("p_conversation_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_dm_conversation_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dm_conversation_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."job_queue_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."job_queue_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_ack"("p_queue" "text", "p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_ack"("p_queue" "text", "p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_claim"("p_queue" "text", "p_n" integer, "p_vt" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_claim"("p_queue" "text", "p_n" integer, "p_vt" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_dead"("p_queue" "text", "p_id" bigint, "p_msg" "jsonb", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_dead"("p_queue" "text", "p_id" bigint, "p_msg" "jsonb", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_enqueue"("p_queue" "text", "p_msg" "jsonb", "p_delay" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_enqueue"("p_queue" "text", "p_msg" "jsonb", "p_delay" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_kick"("p_queue" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_kick"("p_queue" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_report"("p_queue" "text", "p_msg" "jsonb", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_report"("p_queue" "text", "p_msg" "jsonb", "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_retry"("p_queue" "text", "p_id" bigint, "p_delay" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_retry"("p_queue" "text", "p_id" bigint, "p_delay" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."jobs_sweep"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."jobs_sweep"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."keep_device_revoked"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."keep_device_revoked"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_group"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_messages_read"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_url_allowed"("p_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_url_allowed"("p_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."minimum_age_years"() TO "anon";
GRANT ALL ON FUNCTION "public"."minimum_age_years"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."minimum_age_years"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_avatar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_avatar"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_listing"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_listing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_new_echo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_new_echo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderator_remove_echo"("p_echo_id" "uuid", "p_ground" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderator_remove_echo"("p_echo_id" "uuid", "p_ground" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderator_remove_echo"("p_echo_id" "uuid", "p_ground" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_appeal_resolved"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_appeal_resolved"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_comment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_comment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_comment_mention"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_comment_mention"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_echo_bookmark"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_echo_bookmark"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_echo_like"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_echo_like"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_echo_mention"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_echo_mention"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_echo_quote"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_echo_quote"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_echo_reaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_echo_reaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_on_follow"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_on_follow"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_reporter_on_resolution"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_reporter_on_resolution"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ping_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ping_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ping_presence"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_operational_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_operational_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rank_breakdowns"("p_uids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rank_breakdowns"("p_uids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rank_tier_for"("p_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rank_tier_for"("p_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rank_tier_for"("p_points" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_ad_event"("p_ad_id" "uuid", "p_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ad_event"("p_ad_id" "uuid", "p_kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_ranks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_ranks"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_user_taste"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_user_taste"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_user_taste"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_follow_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_follow_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_reason_is_urgent"("p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."report_reason_is_urgent"("p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_reason_is_urgent"("p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_erasure"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_erasure"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_follow"("p_target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_follow"("p_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_follow"("p_target" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_follow_request"("p_requester" "uuid", "p_accept" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_follow_request"("p_requester" "uuid", "p_accept" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_follow_request"("p_requester" "uuid", "p_accept" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_content_on_overturned_appeal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_content_on_overturned_appeal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_on_dismissed_urgent_report"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_on_dismissed_urgent_report"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."scrub_deleted_dm"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scrub_deleted_dm"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_due_rules_reminders"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_due_rules_reminders"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_encrypted_dm"("p_message" "jsonb", "p_keys" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_encrypted_dm"("p_message" "jsonb", "p_keys" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_encrypted_dm"("p_message" "jsonb", "p_keys" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_heartbeat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_heartbeat"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_group_member_role"("p_conversation_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_group_member_role"("p_conversation_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_group_member_role"("p_conversation_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_marketplace_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_marketplace_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_marketplace_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_ad_payment"("p_event_id" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_ad_payment"("p_event_id" "text", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."target_progress"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."target_progress"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."target_progress"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."task_stats"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."task_stats"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."task_stats"("p_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_dm_on_reaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_dm_on_reaction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_habit_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_habit_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_habit_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_group_meta"("p_conversation_id" "uuid", "p_title" "text", "p_avatar_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_group_meta"("p_conversation_id" "uuid", "p_title" "text", "p_avatar_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_group_meta"("p_conversation_id" "uuid", "p_title" "text", "p_avatar_color" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_age_years"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_age_years"("p_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_age_years"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."username_available"("p_username" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."username_available"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_available"("p_username" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_date_of_birth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_date_of_birth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_message_report"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_message_report"() TO "service_role";










































GRANT ALL ON TABLE "public"."ad_events" TO "anon";
GRANT ALL ON TABLE "public"."ad_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_events" TO "service_role";



GRANT ALL ON TABLE "public"."ads" TO "anon";
GRANT ALL ON TABLE "public"."ads" TO "authenticated";
GRANT ALL ON TABLE "public"."ads" TO "service_role";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."ai_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."ai_tool_calls" TO "anon";
GRANT ALL ON TABLE "public"."ai_tool_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_tool_calls" TO "service_role";



GRANT ALL ON TABLE "public"."app_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."app_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."app_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."appeals" TO "anon";
GRANT ALL ON TABLE "public"."appeals" TO "authenticated";
GRANT ALL ON TABLE "public"."appeals" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON TABLE "public"."bookmark_collections" TO "anon";
GRANT ALL ON TABLE "public"."bookmark_collections" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmark_collections" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_runs" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."comment_likes" TO "anon";
GRANT ALL ON TABLE "public"."comment_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_likes" TO "service_role";



GRANT ALL ON TABLE "public"."comment_mentions" TO "anon";
GRANT ALL ON TABLE "public"."comment_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."comment_reactions" TO "anon";
GRANT ALL ON TABLE "public"."comment_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_answer_reactions" TO "anon";
GRANT ALL ON TABLE "public"."daily_answer_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_answer_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_answers" TO "anon";
GRANT ALL ON TABLE "public"."daily_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_answers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_question_bank" TO "anon";
GRANT ALL ON TABLE "public"."daily_question_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_question_bank" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_question_bank_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_question_bank_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_question_bank_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."direct_message_keys" TO "service_role";



GRANT SELECT("message_id"),INSERT("message_id") ON TABLE "public"."direct_message_keys" TO "authenticated";



GRANT SELECT("device_id"),INSERT("device_id") ON TABLE "public"."direct_message_keys" TO "authenticated";



GRANT SELECT("wrapped_key"),INSERT("wrapped_key") ON TABLE "public"."direct_message_keys" TO "authenticated";



GRANT SELECT("nonce"),INSERT("nonce") ON TABLE "public"."direct_message_keys" TO "authenticated";



GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT UPDATE("text") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT UPDATE("deleted_at") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT UPDATE("edited_at") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT SELECT("ciphertext"),INSERT("ciphertext"),UPDATE("ciphertext") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT SELECT("nonce"),INSERT("nonce"),UPDATE("nonce") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT SELECT("ephemeral_public_key"),INSERT("ephemeral_public_key") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT SELECT("enc_version"),INSERT("enc_version") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT SELECT("reactions_changed_at") ON TABLE "public"."direct_messages" TO "authenticated";



GRANT ALL ON TABLE "public"."dm_conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."dm_conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."dm_conversations" TO "anon";
GRANT ALL ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."dm_prefs" TO "anon";
GRANT ALL ON TABLE "public"."dm_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."echo_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."echo_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."echo_comments" TO "anon";
GRANT ALL ON TABLE "public"."echo_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_comments" TO "service_role";



GRANT ALL ON TABLE "public"."echo_likes" TO "anon";
GRANT ALL ON TABLE "public"."echo_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_likes" TO "service_role";



GRANT ALL ON TABLE "public"."echo_mentions" TO "anon";
GRANT ALL ON TABLE "public"."echo_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."public_echoes" TO "anon";
GRANT ALL ON TABLE "public"."public_echoes" TO "authenticated";
GRANT ALL ON TABLE "public"."public_echoes" TO "service_role";



GRANT ALL ON TABLE "public"."echo_reaction_summary" TO "anon";
GRANT ALL ON TABLE "public"."echo_reaction_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_reaction_summary" TO "service_role";



GRANT ALL ON TABLE "public"."echo_reactions" TO "anon";
GRANT ALL ON TABLE "public"."echo_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."echo_reposts" TO "anon";
GRANT ALL ON TABLE "public"."echo_reposts" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_reposts" TO "service_role";



GRANT ALL ON TABLE "public"."echo_views" TO "anon";
GRANT ALL ON TABLE "public"."echo_views" TO "authenticated";
GRANT ALL ON TABLE "public"."echo_views" TO "service_role";



GRANT ALL ON TABLE "public"."erasure_requests" TO "service_role";



GRANT ALL ON TABLE "public"."expense_settings" TO "anon";
GRANT ALL ON TABLE "public"."expense_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_settings" TO "service_role";



GRANT ALL ON TABLE "public"."expense_tx" TO "anon";
GRANT ALL ON TABLE "public"."expense_tx" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_tx" TO "service_role";



GRANT ALL ON TABLE "public"."feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_goals" TO "anon";
GRANT ALL ON TABLE "public"."fitness_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_goals" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_meal" TO "anon";
GRANT ALL ON TABLE "public"."fitness_meal" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_meal" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_measurement" TO "anon";
GRANT ALL ON TABLE "public"."fitness_measurement" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_measurement" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_water" TO "anon";
GRANT ALL ON TABLE "public"."fitness_water" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_water" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_weight" TO "anon";
GRANT ALL ON TABLE "public"."fitness_weight" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_weight" TO "service_role";



GRANT ALL ON TABLE "public"."fitness_workout" TO "anon";
GRANT ALL ON TABLE "public"."fitness_workout" TO "authenticated";
GRANT ALL ON TABLE "public"."fitness_workout" TO "service_role";



GRANT ALL ON TABLE "public"."follow_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."follow_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."habit" TO "anon";
GRANT ALL ON TABLE "public"."habit" TO "authenticated";
GRANT ALL ON TABLE "public"."habit" TO "service_role";



GRANT ALL ON TABLE "public"."habit_entry" TO "anon";
GRANT ALL ON TABLE "public"."habit_entry" TO "authenticated";
GRANT ALL ON TABLE "public"."habit_entry" TO "service_role";



GRANT ALL ON TABLE "public"."interest_embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."learn_bookings" TO "anon";
GRANT ALL ON TABLE "public"."learn_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."learn_lecture_notes" TO "anon";
GRANT ALL ON TABLE "public"."learn_lecture_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_lecture_notes" TO "service_role";



GRANT ALL ON TABLE "public"."learn_lectures" TO "anon";
GRANT ALL ON TABLE "public"."learn_lectures" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_lectures" TO "service_role";



GRANT ALL ON TABLE "public"."learn_packages" TO "anon";
GRANT ALL ON TABLE "public"."learn_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_packages" TO "service_role";



GRANT ALL ON TABLE "public"."learn_slots" TO "anon";
GRANT ALL ON TABLE "public"."learn_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_slots" TO "service_role";



GRANT ALL ON TABLE "public"."learn_tutors" TO "anon";
GRANT ALL ON TABLE "public"."learn_tutors" TO "authenticated";
GRANT ALL ON TABLE "public"."learn_tutors" TO "service_role";



GRANT ALL ON TABLE "public"."marketplace_listings" TO "anon";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."marketplace_listings" TO "service_role";



GRANT ALL ON TABLE "public"."media_url_hosts" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."mini_app_data" TO "anon";
GRANT ALL ON TABLE "public"."mini_app_data" TO "authenticated";
GRANT ALL ON TABLE "public"."mini_app_data" TO "service_role";



GRANT ALL ON TABLE "public"."mini_app_share" TO "anon";
GRANT ALL ON TABLE "public"."mini_app_share" TO "authenticated";
GRANT ALL ON TABLE "public"."mini_app_share" TO "service_role";



GRANT ALL ON TABLE "public"."moderation_decisions" TO "anon";
GRANT ALL ON TABLE "public"."moderation_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT UPDATE("dismissed_at") ON TABLE "public"."notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_groups" TO "anon";
GRANT ALL ON TABLE "public"."notification_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_groups" TO "service_role";



GRANT ALL ON TABLE "public"."notification_profiles" TO "anon";
GRANT ALL ON TABLE "public"."notification_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."office_hour_question_upvotes" TO "anon";
GRANT ALL ON TABLE "public"."office_hour_question_upvotes" TO "authenticated";
GRANT ALL ON TABLE "public"."office_hour_question_upvotes" TO "service_role";



GRANT ALL ON TABLE "public"."office_hour_questions" TO "anon";
GRANT ALL ON TABLE "public"."office_hour_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."office_hour_questions" TO "service_role";



GRANT ALL ON TABLE "public"."office_hour_rsvps" TO "anon";
GRANT ALL ON TABLE "public"."office_hour_rsvps" TO "authenticated";
GRANT ALL ON TABLE "public"."office_hour_rsvps" TO "service_role";



GRANT ALL ON TABLE "public"."office_hours" TO "anon";
GRANT ALL ON TABLE "public"."office_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."office_hours" TO "service_role";



GRANT ALL ON TABLE "public"."payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."probe_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."probe_runs_id_seq" TO "service_role";



GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id"),INSERT("id"),UPDATE("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("username") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("username"),INSERT("username"),UPDATE("username") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("display_name") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("display_name"),INSERT("display_name"),UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("bio") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("bio"),INSERT("bio"),UPDATE("bio") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_color") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_color"),INSERT("avatar_color"),UPDATE("avatar_color") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_verified") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_verified") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("created_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("updated_at"),INSERT("updated_at"),UPDATE("updated_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_url"),INSERT("avatar_url"),UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("push_token") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("language") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("language"),INSERT("language"),UPDATE("language") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("follower_count") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("follower_count") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pronouns") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pronouns"),INSERT("pronouns"),UPDATE("pronouns") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("mood") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("mood"),INSERT("mood"),UPDATE("mood") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("mood_expires_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("mood_expires_at"),INSERT("mood_expires_at"),UPDATE("mood_expires_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("pinned_echo_id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("pinned_echo_id"),INSERT("pinned_echo_id"),UPDATE("pinned_echo_id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_private"),UPDATE("is_private") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("dm_privacy"),UPDATE("dm_privacy") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("activity_status"),UPDATE("activity_status") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("online_status"),UPDATE("online_status") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("read_receipts"),UPDATE("read_receipts") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("ai_model"),UPDATE("ai_model") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("sensitive_content_filter"),UPDATE("sensitive_content_filter") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("content_language"),UPDATE("content_language") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("stream_responses"),UPDATE("stream_responses") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("auto_save_chats"),UPDATE("auto_save_chats") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("is_moderator") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("is_moderator") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("personalized_notifications"),UPDATE("personalized_notifications") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("last_seen_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("date_of_birth") ON TABLE "public"."profiles" TO "service_role";
GRANT INSERT("date_of_birth"),UPDATE("date_of_birth") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("notification_prefs"),UPDATE("notification_prefs") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("allow_downloads"),UPDATE("allow_downloads") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("onboarded_at"),INSERT("onboarded_at"),UPDATE("onboarded_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("hidden_from_discovery") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("rank_points") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("rank_points") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("rank_tier") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("rank_tier") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("rank_active_at") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("rank_active_at") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."provider_breaker" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."quests" TO "anon";
GRANT ALL ON TABLE "public"."quests" TO "authenticated";
GRANT ALL ON TABLE "public"."quests" TO "service_role";



GRANT ALL ON TABLE "public"."rag_embedding_messages" TO "anon";
GRANT ALL ON TABLE "public"."rag_embedding_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_embedding_messages" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT INSERT("reporter_id") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("target_type") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("target_id") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("reason") ON TABLE "public"."reports" TO "authenticated";



GRANT INSERT("details") ON TABLE "public"."reports" TO "authenticated";



GRANT SELECT("disclosed_content"),INSERT("disclosed_content") ON TABLE "public"."reports" TO "authenticated";



GRANT SELECT("disclosed_context"),INSERT("disclosed_context") ON TABLE "public"."reports" TO "authenticated";



GRANT SELECT("disclosed_message_key"),INSERT("disclosed_message_key") ON TABLE "public"."reports" TO "authenticated";



GRANT SELECT("disclosed_at") ON TABLE "public"."reports" TO "authenticated";



GRANT ALL ON TABLE "public"."rules_notices" TO "service_role";



GRANT ALL ON TABLE "public"."salon_members" TO "anon";
GRANT ALL ON TABLE "public"."salon_members" TO "authenticated";
GRANT ALL ON TABLE "public"."salon_members" TO "service_role";



GRANT ALL ON TABLE "public"."salons" TO "anon";
GRANT ALL ON TABLE "public"."salons" TO "authenticated";
GRANT ALL ON TABLE "public"."salons" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."subscription_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."task_item" TO "anon";
GRANT ALL ON TABLE "public"."task_item" TO "authenticated";
GRANT ALL ON TABLE "public"."task_item" TO "service_role";



GRANT ALL ON TABLE "public"."thinking_fingerprints" TO "anon";
GRANT ALL ON TABLE "public"."thinking_fingerprints" TO "authenticated";
GRANT ALL ON TABLE "public"."thinking_fingerprints" TO "service_role";



GRANT ALL ON TABLE "public"."trending_echoes_mv" TO "service_role";



GRANT ALL ON TABLE "public"."user_auras" TO "anon";
GRANT ALL ON TABLE "public"."user_auras" TO "authenticated";
GRANT ALL ON TABLE "public"."user_auras" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "service_role";



GRANT SELECT("id"),INSERT("id") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("user_id"),INSERT("user_id") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("public_key"),INSERT("public_key") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("label"),INSERT("label"),UPDATE("label") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("last_seen_at"),UPDATE("last_seen_at") ON TABLE "public"."user_devices" TO "authenticated";



GRANT SELECT("revoked_at"),UPDATE("revoked_at") ON TABLE "public"."user_devices" TO "authenticated";



GRANT ALL ON TABLE "public"."user_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."user_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."user_interests" TO "anon";
GRANT ALL ON TABLE "public"."user_interests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_interests" TO "service_role";



GRANT ALL ON TABLE "public"."user_mutes" TO "anon";
GRANT ALL ON TABLE "public"."user_mutes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_mutes" TO "service_role";



GRANT ALL ON TABLE "public"."user_not_interested" TO "anon";
GRANT ALL ON TABLE "public"."user_not_interested" TO "authenticated";
GRANT ALL ON TABLE "public"."user_not_interested" TO "service_role";



GRANT ALL ON TABLE "public"."user_quests" TO "anon";
GRANT ALL ON TABLE "public"."user_quests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quests" TO "service_role";



GRANT ALL ON TABLE "public"."user_taste" TO "anon";
GRANT ALL ON TABLE "public"."user_taste" TO "authenticated";
GRANT ALL ON TABLE "public"."user_taste" TO "service_role";



GRANT ALL ON TABLE "public"."verification_requests" TO "anon";
GRANT ALL ON TABLE "public"."verification_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_requests" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."visible_echoes" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."visible_echoes" TO "authenticated";
GRANT ALL ON TABLE "public"."visible_echoes" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_link_codes" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_link_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_link_codes" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_links" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_links" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_links" TO "service_role";



GRANT ALL ON TABLE "public"."year_wraps" TO "anon";
GRANT ALL ON TABLE "public"."year_wraps" TO "authenticated";
GRANT ALL ON TABLE "public"."year_wraps" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































