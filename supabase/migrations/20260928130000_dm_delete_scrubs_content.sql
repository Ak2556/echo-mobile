-- Deleting a DM deletes what it said.
--
-- "Delete" set deleted_at and nothing else. The app drew a tombstone, but the
-- row kept its text (or ciphertext and every device's wrapped key), media and
-- voice paths, link preview and shared echo for ever, and plaintext copies
-- stayed in the conversation's last-message snapshot and the recipient's
-- notification preview.
--
-- The scrub is a trigger so that no client path, old build or future RPC can
-- skip it; BEFORE-trigger writes are not bound by the narrowed column grants.
-- Deletion is final: once set, deleted_at cannot be cleared, and a deleted
-- message cannot be edited back into having content.
--
-- The media objects themselves are left for the unreferenced-media collector:
-- after this, nothing points at them.

begin;

create or replace function public.scrub_deleted_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.scrub_deleted_dm() from public, anon, authenticated;

-- "z_" so it runs after any other BEFORE UPDATE trigger has settled the row.
drop trigger if exists z_scrub_deleted_dm on public.direct_messages;
create trigger z_scrub_deleted_dm
  before update on public.direct_messages
  for each row execute function public.scrub_deleted_dm();

-- Messages deleted before this migration.
delete from public.direct_message_keys k
 using public.direct_messages m
 where m.id = k.message_id
   and m.deleted_at is not null;

update public.dm_conversations c
   set last_message_text = null
  from public.direct_messages m
 where m.conversation_id = c.id
   and m.deleted_at is not null
   and c.last_message_at = m.created_at
   and c.last_message_text is not null;

-- Fires the trigger, which nulls the content (deleted_at is already set).
update public.direct_messages
   set deleted_at = deleted_at
 where deleted_at is not null
   and (text is not null or ciphertext is not null or media_url is not null
        or voice_url is not null or link_preview is not null or shared_echo_id is not null);

commit;
