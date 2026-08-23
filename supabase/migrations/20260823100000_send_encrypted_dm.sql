-- Atomic send for encrypted direct messages.
--
-- WHY AN RPC RATHER THAN TWO INSERTS
-- An encrypted message is meaningless without its wrapped keys. Inserting the
-- message and then the keys as separate statements means a dropped connection
-- between them leaves a row nobody can ever read — permanently, since the
-- message key existed only in the sender's memory. Doing both inside one
-- function makes it a single transaction: either the message and every
-- recipient's key land, or nothing does.
--
-- It also enforces completeness. The function requires a key for every
-- participant, so a client bug cannot silently send a group message that only
-- some members can open.

create or replace function public.send_encrypted_dm(
  p_conversation_id uuid,
  p_ciphertext      text,
  p_nonce           text,
  p_keys            jsonb,               -- [{recipient_id, wrapped_key, wrap_nonce, sender_public_key}]
  p_kind            text default 'text',
  p_reply_to_id     uuid default null,
  p_encryption_version smallint default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_message   uuid;
  v_expected  uuid[];
  v_supplied  uuid[];
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if p_ciphertext is null or p_nonce is null then
    raise exception 'An encrypted message requires ciphertext and a nonce';
  end if;
  if p_keys is null or jsonb_array_length(p_keys) = 0 then
    raise exception 'Refusing to send an encrypted message with no recipient keys';
  end if;

  -- The sender must be in the conversation. RLS covers the direct insert path;
  -- this function is SECURITY DEFINER, so it has to check for itself.
  if not exists (
    select 1 from public.dm_conversations c
     where c.id = p_conversation_id
       and (c.user_a = v_uid or c.user_b = v_uid)
    union all
    select 1 from public.dm_conversation_members m
     where m.conversation_id = p_conversation_id
       and m.user_id = v_uid
  ) then
    raise exception 'You are not a participant in that conversation';
  end if;

  -- Everyone in the conversation except the sender must have a key. Without
  -- this, a bug could produce a group message half the members cannot read,
  -- and nobody would find out until they tried.
  select array_agg(uid order by uid) into v_expected from (
    select unnest(array[c.user_a, c.user_b]) as uid
      from public.dm_conversations c
     where c.id = p_conversation_id
    union
    select m.user_id
      from public.dm_conversation_members m
     where m.conversation_id = p_conversation_id
  ) participants
  where uid <> v_uid;

  select array_agg(uid order by uid) into v_supplied
    from (select (k->>'recipient_id')::uuid as uid
            from jsonb_array_elements(p_keys) k) supplied;

  if coalesce(v_expected, '{}') <> coalesce(v_supplied, '{}') then
    raise exception 'Keys were supplied for % recipients but the conversation has %',
      coalesce(array_length(v_supplied, 1), 0),
      coalesce(array_length(v_expected, 1), 0);
  end if;

  insert into public.direct_messages (
    conversation_id, sender_id, kind, text,
    ciphertext, nonce, encryption_version, reply_to_id
  )
  values (
    p_conversation_id, v_uid, p_kind, null,
    p_ciphertext, p_nonce, p_encryption_version, p_reply_to_id
  )
  returning id into v_message;

  insert into public.dm_message_keys (message_id, recipient_id, wrapped_key, wrap_nonce, sender_public_key)
  select v_message,
         (k->>'recipient_id')::uuid,
         k->>'wrapped_key',
         k->>'wrap_nonce',
         k->>'sender_public_key'
    from jsonb_array_elements(p_keys) k;

  return v_message;
end;
$$;

comment on function public.send_encrypted_dm is
  'Inserts an encrypted direct message and every recipient''s wrapped key in one '
  'transaction. Rejects a send that does not carry a key for every participant, '
  'so a group message can never be readable by only some of its members.';

grant execute on function public.send_encrypted_dm to authenticated;
