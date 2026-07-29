-- Messaging settings, Phase 0 — per-conversation prefs + global active-status.
-- Foundation for the Messenger-parity messaging settings (Chat Details hub).

alter table public.dm_prefs
  add column if not exists muted_until          timestamptz,
  add column if not exists nicknames            jsonb   not null default '{}'::jsonb,
  add column if not exists theme                text,
  add column if not exists quick_reaction       text,
  add column if not exists marked_unread        boolean not null default false,
  add column if not exists disappearing_seconds int     not null default 0;

-- Global privacy: let users hide their active/online status from others.
alter table public.profiles
  add column if not exists show_active boolean not null default true;

-- Direct-message push now respects a *durational* mute: skip if muted forever
-- OR muted_until is still in the future. (1:1 conversations; group fan-out has
-- its own path.)
create or replace function public.fn_dm_push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
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

  v_preview := case new.kind
    when 'image' then '📷 Photo'
    when 'voice' then '🎙️ Voice message'
    when 'echo'  then '💬 Shared an Echo'
    else left(coalesce(new.text, ''), 140)
  end;

  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_recipient_id, 'dm', new.sender_id, new.conversation_id, 'dm_conversation', v_preview);

  return new;
end;
$$;
