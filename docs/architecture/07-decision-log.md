# 07 · Decision log

[← Operations](06-operations.md) · [Index](README.md)

The significant choices, why they were made, and what each one costs. Entries are short on purpose:
the point is to stop someone re-litigating a decision without knowing what it was for, and to make a
reversal deliberate. When a decision changes, add a new entry that supersedes the old one rather than
editing history.

| # | Decision | Status |
|---|---|---|
| [1](#1-supabase-and-row-level-security-instead-of-a-custom-api) | Supabase and row-level security instead of a custom API | Active |
| [2](#2-the-rules-live-in-sql) | The rules live in SQL | Active |
| [3](#3-side-effects-go-through-queues-inside-postgres) | Side effects go through queues inside Postgres | Active, supersedes direct HTTP triggers |
| [4](#4-one-model-call-for-voice-and-the-device-answers-first) | One model call for voice, and the device answers first | Active |
| [5](#5-moderation-fails-closed) | Moderation fails closed | Active |
| [6](#6-media-goes-straight-to-r2-through-a-worker-that-signs) | Media goes straight to R2 through a Worker that signs | Active |
| [7](#7-end-to-end-encryption-for-one-to-one-text-only) | End-to-end encryption for one-to-one text only | Active |
| [8](#8-offline-is-a-query-cache-plus-an-outbox) | Offline is a query cache plus an outbox | Active, supersedes a local database |
| [9](#9-presence-is-a-heartbeat-and-a-gated-function) | Presence is a heartbeat and a gated function | Active, supersedes a public channel |
| [10](#10-read-receipts-keep-a-private-marker) | Read receipts keep a private marker | Active |
| [11](#11-over-the-air-updates-with-a-fingerprint-runtime) | Over-the-air updates with a fingerprint runtime | Active |
| [12](#12-native-projects-are-generated) | Native projects are generated | Active |
| [13](#13-remote-flags-are-a-layer-over-compiled-defaults) | Remote flags are a layer over compiled defaults | Active |
| [14](#14-minimal-table-privileges-on-top-of-rls) | Minimal table privileges on top of RLS | Active |
| [15](#15-gemini-directly-with-openrouter-as-fallback) | Gemini directly, with OpenRouter as fallback | Active |
| [16](#16-the-project-stays-in-tokyo) | The project stays in Tokyo | Active |
| [17](#17-the-icon-bundle-is-generated) | The icon bundle is generated | Active |
| [18](#18-launch-in-india-first) | Launch in India first | Active |

---

## 1. Supabase and row-level security instead of a custom API

**Context.** A small team shipping four platforms needs a backend that does not become a second
product. An earlier FastAPI service existed alongside Supabase.

**Decision.** Use Supabase (Postgres, Auth, Realtime, edge functions) and let the client talk to it
directly through PostgREST under row-level security. The FastAPI service was removed on 2026-09-04
once nothing referenced it.

**Consequences.** There is no service layer to write, scale or secure, and no second place for a rule
to be wrong. The cost is that the schema is the API, so a migration is a public-interface change; that
is why migrations are validated against the live schema and why old builds are protected by gating
destructive steps.

## 2. The rules live in SQL

**Context.** The client can be modified, so any rule enforced only in the app is a suggestion.

**Decision.** Access, rate limits, privacy rules and consequences are RLS policies, column grants,
triggers and functions. The client is thin and asks; Postgres decides.

**Consequences.** Rules cannot be bypassed by a modified client and are tested against a real
database (the flow probes). The cost is that logic is harder to unit-test than TypeScript, that
`security definer` functions are dangerous and must each check the caller, and that policies written
carelessly are slow (hence `(select auth.uid())`).

## 3. Side effects go through queues inside Postgres

**Context.** Pushes, moderation and fan-out call slow or flaky services. The first version of push had
a trigger call an edge function over HTTP; a failure there had no retry.

**Decision.** A transaction enqueues a job (`pgmq`) in the same commit as the row that needs it. A
worker drains the queue with a visibility timeout, retries with backoff, and dead-letters after six
attempts. A cron sweeper kicks any queue whose work was missed.

**Consequences.** A job cannot be lost without its row or vice versa, retries are safe because
handlers are idempotent, and a failure is visible as dead-letter depth. The cost is one more moving
part (the worker) and at-least-once delivery, which handlers must tolerate.

## 4. One model call for voice, and the device answers first

**Context.** Voice is the main input and the AI quota is small.

**Decision.** One call turns audio into a transcript, an intent and a spoken reply. Common commands
and all navigation resolve on the device with no call at all.

**Consequences.** Latency and cost are low for the common path and navigation cannot fail. The cost is
a hand-maintained local phrase table that must be extended before a server round trip is added, and a
failure mode where a short ordinary sentence fires an action by mistake.

## 5. Moderation fails closed

**Context.** Posts are public the moment they are visible.

**Decision.** A post is inserted hidden and becomes visible only when a classifier passes it. If the
classifier cannot answer, the post stays hidden and the job retries.

**Consequences.** An unfunded, throttled or down model **stops publishing** rather than letting
content through; that is the intended direction. It is the first thing to check when "posts are not
appearing". Video is not visually moderated, and this is stated rather than implied.

## 6. Media goes straight to R2 through a Worker that signs

**Context.** Media is large, and routing it through the backend would cost money and latency.

**Decision.** The client uploads directly to Cloudflare R2 with a short-lived signed URL minted by a
Cloudflare Worker, which is also the single point that decides who may read what. Size ceilings are
enforced after upload by a sweep.

**Consequences.** Bytes never touch the app backend and egress is free. The cost is that a presigned
`PUT` cannot carry a length limit, so an oversized object exists for up to fifteen minutes before it
is deleted, and that the Worker's policy is security-critical code.

## 7. End-to-end encryption for one-to-one text only

**Context.** `direct_messages.text` was a plaintext column readable by anyone with database access. An
earlier encryption attempt silently fell back to plaintext and encrypted nothing; it was removed on
2026-08-23.

**Decision.** Seal one-to-one text on the device to each recipient device (X25519, HKDF,
XChaCha20-Poly1305), design it so it **cannot degrade quietly**, and ship it behind a remote flag. The
design was approved on 2026-09-10; the flag was switched on in production on 2026-09-29.

**Consequences.** Staff, a stolen service-role key or a database breach cannot read one-to-one text.
The cost: no forward secrecy, no server-side search or previews, metadata stays visible, groups and
media are not covered, and a restored backup holds ciphertext that only the devices can read. See
[`docs/design/dm-e2ee.md`](../design/dm-e2ee.md).

## 8. Offline is a query cache plus an outbox

**Context.** The app has to open instantly and tolerate a dead connection. A local SQLite database
(WatermelonDB) was added for messaging, with a sync that polled into it.

**Decision.** Persist server state through TanStack Query (MMKV, seven days) and queue writes that
must survive offline in an idempotent outbox. The local-database sync was removed on 2026-09-28
because nothing read what it wrote.

**Consequences.** One caching model instead of two, and idempotent replays. The cost: direct messages
are not queued while offline, and an unused SQLite layer is still constructed at startup and is a
candidate for removal.

## 9. Presence is a heartbeat and a gated function

**Context.** Presence was one public Realtime channel every client joined: an O(users) fan-out, no
server-side privacy, readable with only the public key.

**Decision.** A client writes a heartbeat; a function returns presence only between people who follow
each other, with two independent toggles, reciprocity, and an identical answer for "not allowed" and
"offline". No timestamp is ever returned. Designed and shipped 2026-10-16 to 17.

**Consequences.** Privacy is enforced in the database and the fan-out is gone. The cost is polling
(every 45 seconds) rather than push, and a short window in which builds from before the change still
use the old channel. See the [design](../superpowers/specs/2026-10-16-presence-design.md).

## 10. Read receipts keep a private marker

**Context.** The receipts toggle only hid ticks on the toggler's own screen; the sender could still
read `read_at`.

**Decision.** What you have read is a private per-member marker. `read_at` is set only when the reader
has receipts on, and only for messages unread at that moment.

**Consequences.** The toggle protects what it says. Switching receipts back on cannot expose messages
read privately. The cost is a second read-state concept in the unread-count paths.

## 11. Over-the-air updates with a fingerprint runtime

**Context.** Builds originally shared one runtime version, so updates could reach incompatible native
code, or (after a native change) reach no one.

**Decision.** `runtimeVersion` uses the **fingerprint** policy: a hash of everything native. An update
only reaches builds it is compatible with.

**Consequences.** Safe over-the-air JavaScript delivery. The cost is that builds in the field can have
several fingerprints, each needing its own publish, and that any native change orphans installed
builds until users update, so native changes are batched into planned builds.

## 12. Native projects are generated

**Decision.** `android/` and `ios/` are build output of `expo prebuild` and are gitignored. Native
configuration lives in `app.json`, `app.config.js` and `plugins/`.

**Consequences.** No native merge conflicts, and a reproducible build. The cost is that a quick native
tweak has to be expressed as a config plugin.

## 13. Remote flags are a layer over compiled defaults

**Decision.** The compiled map is the default; the `feature_flags` table overrides it. If the table is
unreachable, the cache is corrupt or a flag has no row, the shipped default applies.

**Consequences.** A kill switch that cannot itself cause an outage. The cost is that a flag cannot
enable something the build does not contain.

## 14. Minimal table privileges on top of RLS

**Context.** Supabase grants `anon` and `authenticated` every privilege on every new table by default,
leaving RLS as the only barrier and `TRUNCATE` (which RLS does not cover) available.

**Decision.** Revoke what is unused (2026-10-16): `anon` is read-only, neither role has `TRUNCATE`,
`REFERENCES`, `TRIGGER` or `MAINTAIN`, views are read-only, and default privileges are lowered.

**Consequences.** Defence in depth: a missing policy is no longer a data-loss bug. The cost is that a
new table needs its grants written explicitly.

## 15. Gemini directly, with OpenRouter as fallback

**Decision.** Chat and moderation call Gemini directly (2026-09-22) with OpenRouter as a fallback
behind a circuit breaker, each attempt time-limited to 25 seconds and every branch metered.

**Consequences.** Faster and cheaper on the primary path, and a quota or outage does not stop the app.
The cost is two providers to configure and a small AI quota that makes failures look like bugs.

## 16. The project stays in Tokyo

**Context.** Every request crosses to Tokyo; measured from the development machine, even a call that
touches no database takes about 200 ms.

**Decision.** A move to a nearer region was attempted and abandoned (2026-09-24). Instead, reduce
round trips: one-call pagination, one queued fan-out job per post, fewer sequential requests per
screen.

**Consequences.** Latency is a constant to design around rather than a problem to fix: the number of
sequential requests, not query time, decides how fast a screen feels.

## 17. The icon bundle is generated

**Context.** The icon library's package barrel put all 1,512 icons into the Hermes bundle (22% of it);
the app imports a few hundred.

**Decision.** Metro resolves the package to a generated file that re-exports only the icons the app
imports (2026-10-19). A test fails if it is stale.

**Consequences.** The Android bundle fell from 14.15 MB to 9.73 MB, which every over-the-air update
downloads. The cost is one command (`node scripts/gen-icon-shim.mjs`) when adding an icon import.

## 18. Launch in India first

**Decision.** Launch in India first, with the interface available in 13 Indian languages from day
one.

**Consequences.** Compliance work targets India's rules first (see [`docs/compliance/`](../compliance/)
and `constants/legal/`); the 13 global languages are built but follow later.

[← Operations](06-operations.md) · [Index](README.md)
