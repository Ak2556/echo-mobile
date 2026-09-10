# End-to-end encryption for 1:1 direct messages

**Date:** 2026-09-10
**Status:** approved design, not yet implemented
**Scope:** one-to-one conversations only. Group DMs are explicitly out.

## Why

`direct_messages.text` is a plaintext column. Every direct message ever sent
is readable by anyone with database access: Echo staff, a leaked service-role
key, a Supabase compromise, or a subpoena. The Privacy Policy (s14) currently
documents exactly this — transport and at-rest encryption with server-held
keys — and it is accurate.

There was an earlier attempt. It was removed on 2026-08-23 because it never
worked: it read sender keys from `public.users`, a table no migration creates,
so the lookup returned empty and **every message silently fell through to
plaintext**. It looked like encryption for months and encrypted nothing.

That failure is the single most important input to this design. A scheme that
cannot silently degrade matters more here than a stronger scheme we cannot
verify.

## Threat model

**Protects against:** anyone who can read the database or its backups —
Echo staff, a stolen service-role key, a Supabase-side breach, a legal demand
served on Echo. After this ships, Echo cannot produce the contents of a 1:1
message because Echo cannot read it.

**Does not protect against, and we must not imply otherwise:**

- A compromised endpoint. Malware or physical access to an unlocked device
  reads messages after decryption; no protocol prevents that.
- **No forward secrecy.** Identity keys are long-lived. If a device's private
  key is extracted, every past message delivered to that device becomes
  readable. A ratchet would fix this and is deliberately deferred — see
  Deferred, below.
- Metadata. Who talks to whom, when, how often, and message sizes stay
  visible to the server. This is not a small caveat and marketing must not
  gloss it.
- Group conversations, which remain server-readable and must be labelled as
  such in the UI.
- Message history predating this feature, which is already plaintext on the
  server and cannot be retroactively encrypted.

## Key architecture

**Per-device identity keys, sender fans out.**

Each device generates an X25519 keypair on first run. The private key is
stored with the same Keychain-backed mechanism as the session
(`lib/secureSessionStorage`) and never leaves the device — not to Echo, not to
a backup. The public key is published to a device registry.

Chosen over a per-user key backed up under a passphrase because that design's
failure mode is unacceptable: a forgotten passphrase destroys every message
with no recovery path. Per-device keys have no such cliff. The cost is that a
newly added device sees messages from that point forward, not history — the
same behaviour as Signal's linked devices, and near-invisible at launch since
all existing history is plaintext and keeps rendering as it does now.

### Schema

```sql
create table public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  public_key    text not null,              -- base64 X25519, 32 bytes
  label         text,                       -- "iPhone", for the user's own audit UI
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz                 -- set on sign-out; never deleted,
                                            -- or old rows lose their key reference
);

create table public.direct_message_keys (
  message_id    uuid not null references public.direct_messages(id) on delete cascade,
  device_id     uuid not null references public.user_devices(id) on delete cascade,
  wrapped_key   text not null,              -- base64, the message key sealed to this device
  nonce         text not null,
  primary key (message_id, device_id)
);
```

`direct_messages` gains `ciphertext text`, `nonce text`,
`ephemeral_public_key text`, and `enc_version smallint`. `text` stays nullable
so legacy plaintext rows keep working.

**RLS.** Device public keys are readable by any authenticated user — you
cannot send to someone without their keys. This leaks how many devices a user
has, which is metadata we already concede. Writes are restricted to the owner.
`direct_message_keys` rows are readable only by the device that owns them,
enforced through `user_devices.user_id = auth.uid()`.

Every one of these gets a column grant. `public.profiles` has already proved
that a missing grant fails the whole SELECT with 42501, and
`profilesColumnGrants.test.ts` exists because of it.

### Message format

Per message:

1. `mk = randomBytes(32)` — a fresh message key.
2. Body encrypted **once**: `XChaCha20-Poly1305(mk, nonce, plaintext)`.
3. One ephemeral X25519 keypair per message. For each recipient device *and
   each of the sender's own other devices*: `shared = X25519(ek_priv,
   device_pub)`, `wk = HKDF-SHA256(shared, info="echo-dm-v1")`, and
   `wrapped = XChaCha20-Poly1305(wk, nonce, mk)` stored in
   `direct_message_keys`.

The body is encrypted once and only a 32-byte key is fanned out. That matters
because DM media reaches tens of megabytes: per-device body encryption would
multiply storage and bandwidth by the device count.

`enc_version` exists so the scheme can be replaced without a migration of
historical rows.

### Media

Attachments are encrypted client-side with their own random key before upload
to the `dm-media` R2 bucket; that key travels inside the encrypted message
body. The server stores ciphertext it cannot read, and the existing
access-controlled `/dm-media` route is unchanged.

### Libraries

`@noble/ciphers` (already shipping — `secureSessionStorage` uses its AES-GCM)
plus `@noble/curves` for X25519. Both pure JS: **no native module, no EAS
rebuild**, which matters given the build quota.

`tweetnacl` is currently a dependency, unused, with `setPRNG` never wired —
leftover from the failed attempt, and it throws `no PRNG` in React Native if
called. Delete it rather than leave a loaded gun in the tree.

Randomness comes from `expo-crypto.getRandomBytes`, already the app's CSPRNG.

## What this breaks

- **Push previews.** `push-fanout` builds notification text from message
  content, which the server can no longer read. Notifications become "New
  message from Alice". Restoring real previews needs an iOS Notification
  Service Extension decrypting on-device — a native change and a rebuild,
  deliberately deferred.
- **Server-side DM translation.** Dropped for DMs; it can return client-side
  later.
- **Not broken:** in-chat search, which already runs client-side over loaded
  rows (`messages.filter`), and moderation of *public* content, which is
  untouched.

## Rollout

Three phases, because a mixed fleet cannot decrypt what it does not
understand.

1. **Publish keys.** Ship device registration and key publication with no
   change to how messages are sent. Builds the registry.
2. **Encrypt when possible.** Encrypt only when every recipient device
   advertises support. Otherwise send plaintext — **and say so in the UI**. A
   conversation renders a lock when it is end-to-end encrypted and does not
   when it is not. This is the compatibility fallback, and it is the exact
   shape of the bug that killed the last attempt, so it is visible in the
   product rather than a silent branch in the code.
3. **Require it.** Once telemetry shows the old versions are gone, drop the
   fallback and fail the send instead.

Existing plaintext history is left as it is. It cannot be re-encrypted — no
one holds the keys it would need — and pretending otherwise would be the same
dishonesty as the last attempt.

## How this design refuses to fail quietly

The previous attempt's defining property was that it degraded silently. This
one must not:

- **Encryption failure fails the send.** If a message cannot be encrypted for
  every target device, the send raises. There is no path that writes plaintext
  because encryption did not work — only the explicit, UI-visible phase-2
  fallback for peers who cannot decrypt yet.
- **A test asserts no plaintext leaves the device.** The outgoing payload is
  inspected in tests for the message body; finding it fails the suite. This is
  the test the last attempt would have failed on day one.
- **The lock in the UI is derived from the row**, not from an intention: it
  reflects whether `ciphertext` is populated, so a regression that stops
  encrypting is visible to every user immediately.

## Testing

- Round trip: encrypt, decrypt, identical plaintext.
- A device that was not a recipient cannot decrypt.
- Tampering with `ciphertext` or `wrapped_key` fails AEAD authentication
  rather than returning garbage.
- Multi-device: a message sent to a user with three devices produces three
  key rows, and the sender's own second device can read it.
- A revoked device gets no new key rows.
- **The plaintext assertion above.**
- Key generation is idempotent per device and survives app restart.

## Deferred, with reasons

- **Forward secrecy (Double Ratchet).** The right long-term answer. Needs
  X3DH, prekeys, per-conversation ratchet state and correct out-of-order
  handling; there is no maintained pure-JS libsignal for React Native, so it
  means a native module or a hand-rolled ratchet. Hand-rolling is the most
  common way E2EE ships broken. Revisit once phase 3 is stable.
- **Safety numbers / key verification.** Without it the server could
  substitute a public key and read messages — the classic MITM on any
  key-directory design. This should follow closely; it is the difference
  between trusting the protocol and trusting Echo. Phase 4.
- **Group E2EE.** Sender keys and re-keying on membership change across up to
  64 members. Its own project.
- **Encrypted push previews** via a Notification Service Extension.

## What may be claimed publicly, and what may not

Accurate after phase 3: "One-to-one messages are end-to-end encrypted. Echo
cannot read them."

Not accurate, and must not be published: any claim covering group messages, any
claim of forward secrecy, any claim that metadata is protected, and any
superlative about being the most secure — none of which this design supports.
