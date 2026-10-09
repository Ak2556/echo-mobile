-- Alt text for photos.
--
-- Posts had no way to describe a photo, so a screen reader announced nothing for
-- the main content of a photo post. `media_alt` holds one description per photo,
-- aligned with media_urls by position (it may be shorter or absent).
--
-- It is user-written text shown to other people, so it is moderated like the rest:
--   * editing it counts as new content (the post is held and re-judged, and
--     content_version moves), exactly as editing the caption does;
--   * the judge reads it (supabase/functions/embed-echo/judge.ts). Deploy that, and
--     the worker that imports it, BEFORE a client that can write alt text ships.
--
-- The feed functions return fixed column lists and do not carry it: the app loads
-- it separately, and only when a screen reader is running.

create or replace function public.alt_texts_ok(p text[])
returns boolean
language sql
immutable
parallel safe
as $$
  select p is null
      or (coalesce(array_length(p, 1), 0) <= 10
          and not exists (select 1 from unnest(p) a where char_length(a) > 400));
$$;

alter table public.public_echoes add column if not exists media_alt text[];

alter table public.public_echoes drop constraint if exists public_echoes_media_alt_check;
alter table public.public_echoes add constraint public_echoes_media_alt_check
  check (public.alt_texts_ok(media_alt));

-- The two functions that decide whether an edit is "new content". Copied from the
-- live definitions with one change: media_alt joins the comparison.

CREATE OR REPLACE FUNCTION public.bump_echo_content_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.guard_client_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
