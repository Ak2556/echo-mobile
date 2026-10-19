# 04 · Key flows

[← Backend and data](03-backend-and-data.md) · [Index](README.md) · Next: [05 · Security and privacy](05-security-and-privacy.md)

Twelve flows, each as a sequence diagram plus the one or two things worth noticing. They are the
ones that cross the most components, or where a mistake would be most expensive.

1. [Signing in and creating an account](#1-signing-in-and-creating-an-account)
2. [Publishing a post](#2-publishing-a-post)
3. [Reading the feed](#3-reading-the-feed)
4. [A notification becoming a push](#4-a-notification-becoming-a-push)
5. [Sending a direct message](#5-sending-a-direct-message)
6. [Presence](#presence)
7. [Read receipts](#7-read-receipts)
8. [Following a private account](#8-following-a-private-account)
9. [Uploading and reading media](#9-uploading-and-reading-media)
10. [A voice command](#10-a-voice-command)
11. [Deleting an account](#11-deleting-an-account)
12. [The daily question](#12-the-daily-question)

---

## 1. Signing in and creating an account

```mermaid
sequenceDiagram
    autonumber
    participant U as Person
    participant C as App
    participant A as Supabase Auth
    participant DB as Postgres

    U->>C: email or phone, Google, or Apple
    C->>A: start sign-in (PKCE)
    A-->>U: one-time code, or the provider's own screen
    U->>A: the code, or the provider's consent
    A->>DB: new auth user
    Note over DB: trigger handle_new_user creates the profile row,<br/>with fallbacks so no provider can leave it empty
    A-->>C: session (JWT and refresh token)
    C->>C: store the session encrypted
    C->>DB: onboarding fills in the profile (authenticated)
    Note over DB: triggers validate the date of birth and<br/>switch behavioural profiling off for minors
```

- **PKCE** means a redirect never carries a refresh token.
- The session is stored **encrypted at rest**: a 32-byte AES-256-GCM key in the device keychain and
  the larger payload in app storage under it. (A keychain entry alone cannot hold a session that
  carries provider tokens.)
- The profile row is created by the **database**, not the client, so every provider (including ones
  that return no name) yields a valid account.

## 2. Publishing a post

```mermaid
sequenceDiagram
    autonumber
    participant C as App
    participant DB as Postgres
    participant Q as pgmq
    participant W as worker
    participant M as Gemini

    C->>DB: insert public_echoes with check_content false
    Note over DB: before the write: client-writable fields, media hosts, rate limits
    DB->>Q: enqueue moderation (trigger)
    DB->>Q: enqueue post_fanout (trigger)
    DB-->>C: saved, but invisible to everyone else
    DB->>W: pg_net kick after commit
    W->>Q: claim a moderation job
    W->>M: judge the text and any images
    alt passed
        M-->>W: pass
        W->>DB: record the verdict, set check_content true, store the embedding
        Note over DB: the post is now visible
    else failed
        M-->>W: fail
        W->>DB: record the decision with its reasons
        Note over DB: stays hidden, the author can appeal within six months
    else model unavailable
        W->>Q: retry with backoff, up to six attempts
        Note over DB: stays hidden meanwhile
    end
    W->>Q: claim a post_fanout job
    W->>DB: fanout_friend_post_batch, 500 followers at a time
    Note over DB: follower notifications are created,<br/>each one queues a push
```

- **Publishing is fail-closed.** The row is created hidden (`check_content = false`) and only a
  passing verdict makes it visible. A throttled or unfunded AI key does not quietly weaken
  moderation: it stops publishing. That is the intended failure direction, and worth knowing before
  debugging "posts are not appearing".
- **A post costs the same to publish for 12 followers or 12 million.** The post queues exactly one
  fan-out job, and the worker expands it in keyset batches of 500; the unique `(user, echo)` key
  makes a retried batch a no-op.
- Offline, the insert goes through the device's [outbox](02-client-app.md#state-two-layers-and-an-outbox)
  and carries a client-supplied id, so a replay cannot create a duplicate.

## 3. Reading the feed

The ranking runs in SQL (`get_personal_feed`). The client asks for a page; the database decides.

```mermaid
flowchart TB
    REQ["get_personal_feed<br/>identity from the JWT, never the argument"] --> ELIG{"can_be_profiled?"}
    ELIG -->|"no: age unknown or under 18"| RANKED["get_ranked_feed<br/>recency + engagement"]
    ELIG -->|"yes"| TASTE["Refresh the taste vector if older than 6 h<br/>(not mid-scroll, so paging stays stable)"]
    TASTE --> CAND

    subgraph CAND["Candidates: about 350, each source index-driven and bounded"]
        F["follow: latest 100 from people you follow"]
        S["semantic: 100 nearest to your taste"]
        T["trending: 100, or 150 with no taste yet"]
        X["exploration: 50 random from the latest 500<br/>(100 with no taste yet)"]
    end

    CAND --> SCORE["Score = base x (1 + 0.6 taste + 0.5 followed + 0.4 past interaction)"]
    SCORE --> EXCL["Exclude: your own posts, blocked, muted, not-interested,<br/>already seen in 90 days, anything not moderated"]
    EXCL --> PAGE["Over-fetch a keyset-paginated page"]
    PAGE --> SEL["Client: lib/feed/feedSelection.ts<br/>author cap + exploration reserve"]
    RANKED --> PAGE
```

- **A user who cannot be profiled never reaches the personalised path.** Age is checked first, so
  the rule that under-18s get no behavioural profiling holds by construction, in Postgres, and fails
  closed on unknown age.
- The taste vector is the average embedding of the last 20 likes, else the user's chosen interests,
  else their last 20 posts, else nothing (and the personalised term scores zero). The strongest
  evidence wins: a like is what someone chose to consume; an interest is what they said; a post is
  only what they produced.
- **Author spread** (one voice cannot own the page) is applied in TypeScript because that rule is
  unit-tested there; SQL ranks, the client selects.
- Cost is bounded: the exclusions run once against about 350 candidate ids rather than the whole
  table, and the taste refresh scales with daily active users, not registered users.

## 4. A notification becoming a push

```mermaid
sequenceDiagram
    autonumber
    participant X as Any trigger or RPC
    participant DB as Postgres
    participant Q as pgmq
    participant W as worker
    participant E as Expo push
    participant D as Device

    X->>DB: insert notifications (like, comment, follow, DM ...)
    Note over DB: the row IS the in-app inbox entry
    DB->>Q: trigger enqueues a push job holding only the notification id
    DB->>W: kick
    W->>DB: read the notification and the recipient's device tokens
    alt older than 6 hours
        W-->>Q: drop it: the inbox still has it
    else
        W->>E: one message per device
        E-->>D: delivered
        E-->>W: tickets, including dead tokens
    end
    alt nothing reached any device
        W->>Q: throw, so it is retried with backoff
    else some devices failed
        W->>W: report the partial delivery, do not retry (it would buzz the others twice)
    end
```

The in-app inbox is complete regardless of push, so dropping a stale or failed push loses nothing.
A tap, from a push or from the inbox, goes through one resolver
([`lib/notifications/tapTarget.ts`](../../lib/notifications/tapTarget.ts)).

## 5. Sending a direct message

One-to-one text is end-to-end encrypted: the server only stores ciphertext.

```mermaid
sequenceDiagram
    autonumber
    participant S as Sender app
    participant DB as Postgres
    participant RT as Realtime
    participant R as Recipient app

    S->>S: pick a fresh message key, encrypt the body (XChaCha20-Poly1305)
    S->>S: wrap that key for each of the recipient's devices (X25519 + HKDF)
    S->>DB: rpc send_encrypted_dm(message, wrapped keys)
    Note over DB: insert direct_messages and direct_message_keys.<br/>Triggers: blocks, rate limits (30/min, 500/day),<br/>conversation last message, push notification
    DB-->>S: id
    DB-->>RT: row change on direct_messages
    RT-->>R: event (filtered by RLS: members only)
    R->>DB: fetch the message and its own wrapped key
    R->>R: unwrap, then decrypt
    R->>R: merge into the cached thread in place
```

- The server sees **who** talks to whom, **when** and **how big**, but not **what**. There is no
  forward secrecy, and groups, photos and voice are not covered. The design and its limits are in
  [`docs/design/dm-e2ee.md`](../design/dm-e2ee.md).
- A push for an encrypted message carries **no preview**: the server has none to send.
- **Encryption cannot degrade quietly.** If a message cannot be sealed for every target device, the
  send **fails**; it never falls back to plaintext on an error. The one deliberate exception is a
  recipient who has not published a device key yet: then the message is sent unencrypted and the
  conversation shows **no lock**. The lock is derived from whether `ciphertext` is populated, so a
  regression that stops encrypting is visible to every user at once. (An earlier attempt silently
  fell back to plaintext and encrypted nothing for months; this is the lesson.)

<a id="presence"></a>

## 6. Presence

A green dot and a coarse "last active", shown only between people who follow each other.

```mermaid
sequenceDiagram
    autonumber
    participant A as App (the person)
    participant DB as Postgres
    participant B as App (a mutual follow)

    loop every 60 s while the app is in the foreground
        A->>DB: rpc ping_presence()
        Note over DB: both toggles off: delete the row, store nothing.<br/>Otherwise upsert now(), at most once per 20 s
    end
    loop every 45 s, for the people on screen (max 50)
        B->>DB: rpc get_presence(ids)
        Note over DB: for each id, return a row.<br/>visible = mutual follows and no block either way.<br/>online = heartbeat within 90 s, both people share online status.<br/>last_active = a coarse code, both share last-active
        DB-->>B: online, last_active (never a timestamp)
    end
```

- **Privacy is enforced in the function, not the client.** A stranger, a one-way follower, a blocked
  person and someone who opted out all get an **identical** row ("offline, nothing to say"), so the
  function cannot be used to learn who follows whom or who blocked whom.
- **Two independent toggles:** *Online status* controls the dot, *Last active* controls the phrase.
  Reciprocity applies: if you share nothing, you see nothing.
- **No exact time ever leaves the server.** `last_active` is one of `recent` (under an hour),
  `today`, `yesterday`, `this_week`, or nothing.
- It replaced a single public channel that every client joined, which was an O(users) fan-out and
  could be read by anyone holding the public key. See
  [`docs/superpowers/specs/2026-10-16-presence-design.md`](../superpowers/specs/2026-10-16-presence-design.md).

## 7. Read receipts

```mermaid
sequenceDiagram
    autonumber
    participant R as Reader app
    participant DB as Postgres
    participant S as Sender app

    R->>DB: open a thread: rpc mark_messages_read(conversation)
    Note over DB: always: move the reader's private marker<br/>(dm_read_state.last_read_at). This drives unread counts.
    alt the reader has receipts on
        Note over DB: also set read_at, but only on messages that were<br/>unread at that moment
    else receipts off
        Note over DB: set nothing the sender can see
    end
    S->>DB: load the thread
    DB-->>S: read_at on messages, only where the reader allowed it
```

- What *you* have read is private and lives in your own marker, so unread counts and the "new
  messages" divider never depend on receipts.
- The "only on messages that were unread at that moment" rule matters: without it, switching
  receipts back **on** would turn every message you read privately while they were off into a visible
  receipt. The probe suite caught this during design.

## 8. Following a private account

```mermaid
sequenceDiagram
    autonumber
    participant F as Follower app
    participant DB as Postgres
    participant O as Owner app

    F->>DB: rpc request_follow(target)
    Note over DB: public target: follow at once.<br/>Private target: store a request and notify the owner.<br/>A direct insert into follows is refused by policy for a private target
    DB-->>O: notification: follow request
    alt owner approves
        O->>DB: rpc respond_follow_request(requester, true)
        DB->>DB: insert the follow, adjust counters, notify
    else owner declines
        O->>DB: rpc respond_follow_request(requester, false)
    end
    Note over DB: if the account later goes public, pending requests are released
```

The rule lives in the `follows` insert policy and in these RPCs, so a modified client cannot follow
a private account by skipping the request. If the owner has blocked the requester, `request_follow`
still answers "requested" and creates nothing, so a block cannot be detected from the answer. Private accounts hide their echoes, comments and likes
from non-followers; the profile header itself stays visible.

## 9. Uploading and reading media

```mermaid
sequenceDiagram
    autonumber
    participant C as App
    participant W as Cloudflare worker
    participant R as R2
    participant V as Viewer

    C->>W: GET /upload-url (bucket, key) with the user's token
    W->>W: check the token and the bucket policy
    W-->>C: short-lived signed PUT URL
    C->>R: PUT the bytes, directly
    Note over C,R: the bytes never pass through the app backend
    V->>W: GET /media/bucket/key
    alt downloads
        W->>R: always read through (so deletion means deletion)
    else avatars
        W-->>V: short TTL, revalidated (fixed key, overwritten in place)
    else feed media
        W-->>V: immutable, cached for a year (content-addressed)
    end
    Note over W,R: dm-media is different: only members of the<br/>conversation may read it
```

- The worker is the **only** thing that can mint upload signatures, so it is the single place that
  decides who may write where.
- Size ceilings are enforced **after** upload by a 15-minute sweep, because a presigned `PUT`
  cannot carry a length limit.
- Moderation of images happens when the *post* is judged, not at upload.

## 10. A voice command

```mermaid
sequenceDiagram
    autonumber
    participant U as Person
    participant D as Device
    participant E as voice-command
    participant M as Gemini
    participant X as dispatch.ts

    U->>D: hold to talk, speech to text on the device
    D->>D: lib/voice/localIntent.ts: rules and the destination table
    alt recognised on the device
        D->>X: intent and arguments
        Note over D,X: no network, no quota, nothing to fail
    else not recognised
        D->>E: the transcript or audio, with the user's token
        E->>M: one call: transcript, language, intent, reply
        M-->>E: result
        E-->>X: intent, arguments, spoken reply
    end
    X->>X: one of 19 intents
    alt navigation
        X->>X: router.push, resolved from a finite table
    else contextual action
        X->>X: only the FOCUSED screen's handlers can act
    end
```

The device answers first, so navigation is instant and free; the model is consulted only for
phrasings the local table cannot resolve. Dictation fills a field and **never submits**, so a
mis-transcription cannot publish or reply on its own.

## 11. Deleting an account

Erasure has to reach every store, and finish even if a step fails.

```mermaid
sequenceDiagram
    autonumber
    participant C as App
    participant F as delete-account
    participant DB as Postgres
    participant Q as pgmq
    participant W as media worker
    participant R as R2

    C->>F: delete my account (with the user's token)
    F->>DB: record erasure_requests state requested
    F->>Q: enqueue an erasure job first, as the safety net
    F->>W: POST /purge-user (shared secret)
    W->>R: delete the user's objects in every bucket
    F->>F: purge the user's files in Supabase Storage
    F->>DB: state media_purged
    F->>DB: delete the account rows and the auth user
    F->>DB: state done
    Note over F,Q: every step is safe to repeat. If one fails,<br/>the queued job resumes from the step it reached.
```

Deletion used to be a single request: a failure after the media purge ended in "contact support"
with a half-erased account. It is now a stored, resumable state machine whose steps are idempotent.
The flow probes check that, after deletion, **no row in any `public` table** still refers to the
user.

## 12. The daily question

The retention ritual: one question, the same for everyone, that closes.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as pg_cron (13:30 UTC)
    participant DB as Postgres
    participant Q as pgmq
    participant W as worker
    participant E as Expo push
    participant D as Devices

    Cron->>DB: claim_daily_broadcast()
    DB->>DB: ensure today's question exists, record the run once
    DB->>Q: one broadcast job per batch of 100 users
    W->>Q: claim a batch
    W->>E: today's question to every device each user has
    E-->>D: delivered
    Note over DB: recording the run once means a repeat of the cron<br/>cannot send the question twice
```

A late question is worse than none ("today's question" hours late is yesterday's), so a batch older
than six hours is dropped rather than sent.

[← Backend and data](03-backend-and-data.md) · [Index](README.md) · Next: [05 · Security and privacy](05-security-and-privacy.md)
