-- End-to-end encryption for direct messages.
--
-- DESIGN
-- Every message gets a fresh random symmetric key. The body is sealed with
-- that key (NaCl secretbox). The key itself is then wrapped once per recipient
-- using NaCl box against that recipient's public key.
--
--     ciphertext  = secretbox(body, messageKey, nonce)
--     wrapped_key = box(messageKey, recipientPublicKey, senderPrivateKey)
--
-- One code path covers 1:1 and groups — a direct message is simply the case
-- where there is one recipient. Group size costs one wrapped key per member,
-- a few hundred bytes each, which is far simpler than sender-key distribution
-- and correct at Echo's scale.
--
-- WHAT THE SERVER CAN AND CANNOT SEE
--   cannot: message bodies, media contents, and the message keys — every
--           wrapped key is sealed to a private key that never leaves a device
--   can:    who is in a conversation, when messages were sent, and their size
--
-- That distinction is deliberate and is what the Privacy Policy must say.
-- E2EE hides content, not the existence of a conversation.
--
-- KEY LOSS IS EXPECTED
-- Private keys live in the device keystore and are never uploaded, so there is
-- no key escrow and no history migration: a new device cannot read old
-- messages. That is the honest trade for "Echo cannot read your messages", and
-- it is the same choice Signal makes by default.

-- ── 1. public key registry ──────────────────────────────────────────────────
-- Lives on profiles. The earlier attempt (20260820121112) targeted
-- public.users, a table that does not exist, which is why key registration
-- silently never worked.
alter table public.profiles
  add column if not exists public_key text,
  add column if not exists key_updated_at timestamptz;

comment on column public.profiles.public_key is
  'Base64 Curve25519 public key for this account''s active device. The private '
  'half is generated on device and stored in the OS keystore; it is never '
  'transmitted. Rotating a device replaces this value and makes previously '
  'received messages permanently unreadable, by design.';

create index if not exists idx_profiles_public_key
  on public.profiles (id) where public_key is not null;

-- Public keys are public — every participant needs to read them to encrypt.
grant select (public_key, key_updated_at) on public.profiles to authenticated;

-- ── 2. ciphertext columns on the message ────────────────────────────────────
alter table public.direct_messages
  add column if not exists ciphertext text,
  add column if not exists nonce text,
  -- Lets a future scheme change be recognised rather than mis-parsed.
  add column if not exists encryption_version smallint;

comment on column public.direct_messages.ciphertext is
  'Base64 NaCl secretbox of the message body. When set, the plaintext columns '
  '(text, link_preview) must be null and the client must refuse to render '
  'anything it cannot decrypt rather than falling back to plaintext.';

-- ── 3. per-recipient wrapped keys ───────────────────────────────────────────
create table if not exists public.dm_message_keys (
  message_id   uuid not null references public.direct_messages(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  -- box(messageKey -> recipient public key, sealed with the sender's private key)
  wrapped_key  text not null,
  wrap_nonce   text not null,
  -- The sender's public key at send time, so the recipient can open the box
  -- even if the sender later rotates devices.
  sender_public_key text not null,
  created_at   timestamptz not null default now(),
  primary key (message_id, recipient_id)
);

comment on table public.dm_message_keys is
  'One row per recipient per message: the message key, sealed to that '
  'recipient. A row is useless without the recipient''s device private key.';

create index if not exists idx_dm_message_keys_recipient
  on public.dm_message_keys (recipient_id, message_id);

alter table public.dm_message_keys enable row level security;

-- A recipient may read ONLY their own wrapped key. Reading another user's row
-- would still be useless without their private key, but there is no reason to
-- expose it.
drop policy if exists "dm_keys_select_own" on public.dm_message_keys;
create policy "dm_keys_select_own" on public.dm_message_keys
  for select using (auth.uid() = recipient_id);

-- Only the sender of the underlying message may create keys for it, and only
-- for people who are actually in that conversation.
drop policy if exists "dm_keys_insert_sender" on public.dm_message_keys;
create policy "dm_keys_insert_sender" on public.dm_message_keys
  for insert with check (
    exists (
      select 1
        from public.direct_messages m
        join public.dm_conversations c on c.id = m.conversation_id
       where m.id = dm_message_keys.message_id
         and m.sender_id = auth.uid()
         and (
           c.user_a = dm_message_keys.recipient_id
           or c.user_b = dm_message_keys.recipient_id
           or exists (
             select 1 from public.dm_conversation_members mem
              where mem.conversation_id = c.id
                and mem.user_id = dm_message_keys.recipient_id
           )
         )
    )
  );

-- Keys are immutable. Rewriting one would let a sender swap the body a
-- recipient already holds.
revoke update, delete on public.dm_message_keys from authenticated;

-- ── 4. an encrypted message must not also carry plaintext ───────────────────
-- Belt and braces against a client bug quietly downgrading to cleartext.
alter table public.direct_messages
  drop constraint if exists direct_messages_no_plaintext_when_encrypted;
alter table public.direct_messages
  add constraint direct_messages_no_plaintext_when_encrypted
  check (
    ciphertext is null
    or (text is null and link_preview is null)
  );
