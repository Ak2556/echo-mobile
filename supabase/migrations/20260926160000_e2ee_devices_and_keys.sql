-- End-to-end encryption for 1:1 DMs, phases 1 and 2.
-- Spec: docs/superpowers/specs/2026-09-10-dm-e2e-encryption-design.md
-- Plan: docs/superpowers/plans/2026-09-26-dm-e2ee-phases-1-2.md
--
-- Additive only. No existing row changes and no client reads a new column
-- until the app ships, so this is safe to apply before the build.
--
-- Sorts after 20260926155000, which narrowed authenticated's UPDATE on
-- direct_messages to (text, edited_at, deleted_at). The UPDATE grant on
-- (ciphertext, nonce) below is additive to that.

-- ── Device registry ─────────────────────────────────────────────────────────
create table public.user_devices (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  public_key    text not null check (public_key ~ '^[0-9a-f]{64}$'),
  -- The platform only (ios / android / web / macos). Every signed-in user can
  -- read it, so it must never carry a name.
  label         text check (label in ('ios', 'android', 'web', 'macos')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  -- Set on sign-out. Rows are never deleted, or old key rows lose their device.
  revoked_at    timestamptz
);

create index user_devices_active_by_user on public.user_devices (user_id) where revoked_at is null;

alter table public.user_devices enable row level security;
revoke all on public.user_devices from anon, authenticated;
grant select (id, user_id, public_key, label, created_at, last_seen_at, revoked_at) on public.user_devices to authenticated;
grant insert (id, user_id, public_key, label) on public.user_devices to authenticated;
grant update (label, last_seen_at, revoked_at) on public.user_devices to authenticated;

-- You cannot send to someone without their keys, so keys are readable by
-- anyone signed in. That reveals how many devices a user has, which the spec
-- concedes as metadata.
create policy user_devices_select on public.user_devices
  for select to authenticated
  using (true);
create policy user_devices_insert on public.user_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null);
create policy user_devices_update on public.user_devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A revoked key must stay revoked: un-revoking would quietly resume delivery
-- to a device the user signed out of.
create or replace function public.keep_device_revoked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked device stays revoked' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.keep_device_revoked() from public, anon, authenticated;
create trigger a_keep_device_revoked
  before update on public.user_devices
  for each row execute function public.keep_device_revoked();

-- Bounds key-row fan-out: a user minting devices in a loop would multiply the
-- key rows written for every message sent to them.
create trigger rate_limit_user_devices_day
  before insert on public.user_devices
  for each row execute function public.enforce_insert_rate_limit('e2ee_device_day', '10', '86400', 'user_id');

-- ── Per-device message keys ─────────────────────────────────────────────────
create table public.direct_message_keys (
  message_id   uuid not null references public.direct_messages(id) on delete cascade,
  device_id    uuid not null references public.user_devices(id) on delete cascade,
  wrapped_key  text not null check (wrapped_key ~ '^[0-9a-f]{96}$'),
  nonce        text not null check (nonce ~ '^[0-9a-f]{48}$'),
  primary key (message_id, device_id)
);

create index direct_message_keys_by_device on public.direct_message_keys (device_id);

alter table public.direct_message_keys enable row level security;
revoke all on public.direct_message_keys from anon, authenticated;
grant select (message_id, device_id, wrapped_key, nonce) on public.direct_message_keys to authenticated;
grant insert (message_id, device_id, wrapped_key, nonce) on public.direct_message_keys to authenticated;

create policy dm_keys_select_own_device on public.direct_message_keys
  for select to authenticated
  using (exists (
    select 1 from public.user_devices d
     where d.id = device_id and d.user_id = (select auth.uid())
  ));
create policy dm_keys_insert_by_sender on public.direct_message_keys
  for insert to authenticated
  with check (
    exists (
      select 1 from public.direct_messages m
       where m.id = message_id and m.sender_id = (select auth.uid())
    )
    and exists (
      select 1 from public.user_devices d
       where d.id = device_id and d.revoked_at is null
    )
  );

-- ── Sealed messages ─────────────────────────────────────────────────────────
alter table public.direct_messages
  add column ciphertext text,
  add column nonce text,
  add column ephemeral_public_key text,
  add column enc_version smallint;

-- A sealed row has no plaintext: enforced here, not just in the client. An old
-- client that edits a sealed row by writing `text` fails loudly on this.
alter table public.direct_messages
  add constraint direct_messages_encryption_coherent check (
    (ciphertext is null and nonce is null and ephemeral_public_key is null and enc_version is null)
    or (
      ciphertext is not null
      and nonce ~ '^[0-9a-f]{48}$'
      and ephemeral_public_key ~ '^[0-9a-f]{64}$'
      and enc_version = 1
      and text is null
      and kind in ('text', 'link', 'contact', 'echo')
    )
  );

grant select (ciphertext, nonce, ephemeral_public_key, enc_version) on public.direct_messages to authenticated;
grant insert (ciphertext, nonce, ephemeral_public_key, enc_version) on public.direct_messages to authenticated;
grant update (ciphertext, nonce) on public.direct_messages to authenticated;

-- ── Atomic send ─────────────────────────────────────────────────────────────
-- A message and its key rows commit together or not at all. SECURITY INVOKER:
-- both inserts run as the caller, so every RLS policy and trigger on
-- direct_messages (blocks, rate limits, previews) still applies.
create or replace function public.send_encrypted_dm(p_message jsonb, p_keys jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
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
revoke all on function public.send_encrypted_dm(jsonb, jsonb) from public, anon;
grant execute on function public.send_encrypted_dm(jsonb, jsonb) to authenticated;

-- ── Server-side previews never carry a sealed message ───────────────────────
create or replace function public.fn_sync_conv_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.fn_dm_push_notify()
returns trigger
language plpgsql
security definer
set search_path = public
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
    when new.kind = 'echo'  then '💬 Shared an Echo'
    else left(coalesce(new.text, ''), 140)
  end;
  insert into public.notifications (user_id, type, actor_id, target_id, target_kind, preview)
  values (v_recipient_id, 'dm', new.sender_id, new.conversation_id, 'dm_conversation', v_preview);
  return new;
end;
$$;

-- ── Kill switch ─────────────────────────────────────────────────────────────
insert into public.feature_flags (key, enabled, note)
values ('e2eeSend', false, 'Seal 1:1 DMs when the recipient has a device key. Off = send plaintext (no lock). Reading sealed messages is never gated.')
on conflict (key) do nothing;
