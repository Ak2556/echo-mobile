-- EchoX: the user-visible copy that lives in the database.
--
-- The product is now EchoX, and a post is called a post. Almost all of that is app text (OTA).
-- Three strings are written by the database itself, so they are changed here and nowhere else:
--
--   fn_dm_push_notify          the preview on the notification when someone shares a post in a DM
--   fn_sync_conv_last_message  the preview in the inbox row for the same message
--   validate_date_of_birth     the age-gate error ("EchoX requires a minimum age of 18 years")
--
-- The app does not match on any of this text (checked), so nothing depends on the old wording.
--
-- Each body below is the production definition, copied from the 2026-10-16 schema snapshot (no
-- later migration touches these three), with one string changed. CREATE OR REPLACE keeps the
-- owner and the privileges, but it does reset SET clauses, so SECURITY DEFINER and
-- search_path = public are restated exactly as production has them.
--
-- The inbox preview is also STORED (dm_conversations.last_message_text), and so is the
-- notification preview, so the rows that already hold the old words are brought along.
-- Idempotent: running it twice changes nothing the second time.

create or replace function public.fn_dm_push_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    when new.kind = 'echo'  then '💬 Shared a post'
    else left(coalesce(new.text, ''), 140)
  end;
  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_recipient_id, 'dm', new.sender_id, new.conversation_id, 'dm_conversation', v_preview);
  return new;
end;
$$;

create or replace function public.fn_sync_conv_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update dm_conversations
     set last_message_at   = new.created_at,
         last_message_text = case
                               when new.ciphertext is not null then null
                               when new.kind = 'echo'  then 'Shared a post'
                               when new.kind = 'image' then 'Photo'
                               when new.kind = 'voice' then 'Voice message'
                               else new.text
                             end,
         last_message_kind = new.kind
   where id = new.conversation_id;
  return new;
end;
$$;

create or replace function public.validate_date_of_birth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    raise exception 'EchoX requires a minimum age of % years', public.minimum_age_years()
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

-- Rows written before today keep the old words unless they are brought along.
update public.dm_conversations
   set last_message_text = 'Shared a post'
 where last_message_text = 'Shared an Echo';

update public.notifications
   set preview = '💬 Shared a post'
 where preview = '💬 Shared an Echo';
