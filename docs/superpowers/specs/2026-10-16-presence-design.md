# Presence: who is online, who was last active, and who may know

Status: **implemented** (server 2026-10-17, client and read receipts the same week). Written 2026-10-16 at the owner's request during the feature freeze. This is the design as approved; where the code differs, the code is right. Section 8 (read receipts) shipped as its own series.

## 1. Decisions (owner, 2026-10-16)

| Question | Decision |
|---|---|
| Who may see presence? | **Mutual follows** only (both follow each other, neither has blocked the other). |
| How much? | **Online dot plus a coarse "last active"** phrase. Never an exact time. |
| Settings | **Two toggles with distinct meanings**: "Online status" (the dot) and "Last active" (the phrase). |
| Read receipts | **Included as its own phase** (section 8). |
| Transport | **Approach A**: heartbeat into the database, read through a gated function. The global Realtime channel is removed. |

## 2. What exists today (verified 2026-10-16)

- **Online dot** comes from one global Supabase Realtime presence channel, `online-users` (`lib/social/presence.ts`). Every signed-in client joins and tracks itself; every client receives the whole online set. `isUserOnline(id)` in `lib/ui/theme.ts` reads it and drives the green dot on `Avatar`, in the inbox, the thread, profiles, stories and groups.
- **The channel is public, not private.** It is opened without `private: true`, and `realtime.messages` has RLS on with zero policies. A signed-out client holding only the anon key (which ships in the app and the website) joined it successfully. At the time nobody else was online, so exposure of real ids is inferred from how public presence works, not observed.
- **Nothing is enforced on the server.** No database function reads `activity_status`, `online_status`, `read_receipts` or `show_active`. `online_status` is honoured only by the client (it stops broadcasting and stops rendering dots). `activity_status` has no consumer at all. `show_active` is an unused column.
- **Two settings with near-identical copy**: "Activity Status — Show when you're online" and "Online Status — Let others see your online indicator" (`app/settings.tsx`).
- **Last active is dead end to end.** `ping_presence()` exists and writes `profiles.last_seen_at`, but nothing in the client calls it; 0 of 51 profiles have a value. `get_dm_conversations` returns `other_last_seen_at` and the thread reads `profiles.last_seen_at`, so a DM "last seen" cannot show. If it were wired as is, `ping_presence` ignores every privacy setting and any signed-in user could read the column (profiles are `using true`; `last_seen_at` is column-granted to `authenticated`).
- **Read receipts do not keep their promise.** `mark_messages_read` always sets `direct_messages.read_at`, which the sender can read. The toggle only hides the ticks on the toggler's own screen.
- The scale notes already flag global presence (an O(users) fan-out on every join and leave) as a top risk.

## 3. Goals and non-goals

Goals: presence is visible only to mutual follows; every rule is enforced in SQL, not in a client that can be modified; the two settings do exactly what their labels say; no exact timestamp ever leaves the server; the global fan-out is gone.

Non-goals: typing indicators (a separate channel, untouched), "seen" for groups, push or notification behaviour, any change to who can message whom (`dm_privacy` is separate), exact last-seen times, history.

## 4. Server design

### 4.1 Table

```sql
create unlogged table public.user_presence (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;   -- no policies: deny all
revoke all on public.user_presence from anon, authenticated;
```

Unlogged: presence is ephemeral and a crash clearing it is harmless. No triggers and no extra indexes, so the heartbeat is a cheap in-place update. `on delete cascade` means account deletion removes the row; the erasure probe's residue scan covers it with no extra work.

### 4.2 `ping_presence()` (rewritten, `security definer`, `search_path = ''`)

- Does nothing without `auth.uid()`.
- If the caller has **both** `online_status` and `activity_status` off, it deletes their row and returns: nothing is stored for someone who shares nothing.
- Otherwise upserts `now()`, but only when the stored value is older than 20 seconds (the `where` on the conflict update), so a misbehaving client cannot turn it into a write storm.
- It no longer touches `profiles.last_seen_at`.

### 4.3 `get_presence(p_user_ids uuid[])`

`returns table(user_id uuid, online boolean, last_active text)`, `security definer`, `stable`, execute granted to `authenticated` only (revoked from `public` and `anon`).

For each requested id (at most 50, extras ignored), with `me = auth.uid()`:

- **visible** = both follow rows exist (`me -> target` and `target -> me`) **and** no row in `user_blocks` in either direction.
- **online** = visible, target `online_status`, caller `online_status` (reciprocity), and `last_seen_at > now() - interval '90 seconds'`.
- **last_active**, only when visible, not online, target `activity_status`, caller `activity_status` (reciprocity), based on age: under 1 hour `recent`, under 24 hours `today`, under 48 hours `yesterday`, under 7 days `this_week`, otherwise null. Age-based, not calendar-based, so there is no timezone logic.
- **Every requested id gets a row.** Anything not visible, opted out, or blocked returns `online=false, last_active=null`, indistinguishable from "offline and quiet". The function therefore cannot be used to learn who follows whom or who blocked whom.
- Never returns a timestamp.

A user with "Online status" off but "Last active" on therefore appears as "Active recently" even while actually online: the phrase is the only thing they chose to share, and it is hour-level at best.

Reciprocity matches today's client behaviour ("`onlineStatus` gates BOTH directions") and discourages watching without being watched.

## 5. Client design

- **Heartbeat.** A small hook in the root layout calls `ping_presence` every 60 seconds while the app is foregrounded and a session exists; it stops on background and on sign-out. One call on foreground return.
- **`usePresence(ids)`** (React Query, `staleTime` 30 s, refetch every 45 s while focused). It batches the ids on screen (the inbox page, the thread partner, a profile), up to 50, and writes the result into a Zustand store keyed by user id.
- **`isUserOnline(id)`** keeps its signature and reads the new store, so `Avatar` and every call site stay as they are. `lib/ui/theme.ts` loses its dependency on the channel store.
- **Phrase.** The DM thread header and the profile header show "Active now" / "Active recently" / "Active today" / "Active yesterday" / "Active this week", or nothing. Five strings through `ttx()`, English plus Hindi drafts marked for native review.
- **Deleted.** `lib/social/presence.ts` (the channel, its ref-counting and the `usePresenceTracking` hook). A guard test fails if `channel('online-users'` ever returns.
- **Settings** (`app/settings.tsx`): "Online status — Show a green dot to people who follow you back" and "Last active — Show roughly when you were last active, like 'Active today', to people who follow you back". Both write the existing `online_status` / `activity_status` columns, so nobody's saved choice is lost. Store field names stay.
- **API layer** (`lib/supabaseEchoApi.ts`): add `fetchPresence(ids)`; stop selecting `last_seen_at`; stop mapping `otherLastSeenAt` once the server no longer returns it (see 6).

## 6. Rollout and compatibility (the traps)

1. **Old builds keep working until they update.** They still join `online-users` and still select `profiles.last_seen_at` (the select fails whole if the column is revoked). So in the first migration `profiles.last_seen_at` is **not** revoked or dropped; it stays null forever, because `ping_presence` no longer writes it. `get_dm_conversations` keeps returning `other_last_seen_at` (always null) until a later migration.
2. **The public channel cannot be deleted from the repo.** It stays joinable by anyone with the anon key, and old builds keep announcing on it. Closing it is **an owner step**: turn off public Realtime channels in the dashboard (Realtime settings) once most phones are on the new build. Old builds then lose their dots gracefully; nothing crashes.
3. **Order:** (a) server migration (table, `ping_presence`, `get_presence`); (b) client OTA; (c) owner turns off public channels; (d) a later migration drops `profiles.last_seen_at`, `show_active` and `other_last_seen_at`.
4. The OTA reaches three runtimes (iOS, Android current, Android old); all need the same JS, as for every other change.

## 7. Privacy analysis

- A stranger, a one-way follower, a blocked person and an opted-out user are all indistinguishable in the output.
- A modified client can no longer see anyone's presence it is not entitled to, because the data is only reachable through `get_presence`.
- The heartbeat reveals "online within 90 seconds" to mutual follows who opted in; nothing finer. The phrase reveals at most hour-level information, and nothing after a week.
- Someone who turns both toggles off stops being recorded at all.
- A mutual follow can still infer rough patterns over weeks from watching the dot. That is inherent to showing a dot; the toggle is the control.
- The 50-id cap and the 20-second write guard bound abuse; the function does not scan.

## 8. Phase two: read receipts

Problem: `mark_messages_read` always sets `read_at`, which the sender reads, so the toggle protects nothing.

- Add a private marker, `dm_conversation_members.last_read_at` (per member), used for unread counts and badges. Backfill from each member's latest `read_at` (or the conversation's creation time).
- `mark_messages_read` updates `last_read_at` always, and sets `direct_messages.read_at` **only when the reader's `read_receipts` is on, and only for messages that were unread at that moment** (newer than the previous marker). Without that second condition, switching receipts back on would turn every message read privately while they were off into a visible receipt. The probe suite caught this while the plan was being written.
- The unread-count paths change from `read_at is null` to `created_at > last_read_at`: `get_dm_conversations`, the conversation-list index migration's query, and the client's unread logic.
- Hiding other people's ticks on your own screen stays client-side; it is your own display, not a privacy boundary.
- Receipts are one-to-one only (`read_at` is a single timestamp); groups are out of scope.
- This touches the unread-count code, so it is built, probed and shipped separately, after presence.

## 9. Testing

**Database probes** (added to `scripts/probe-flows.mjs`, run on the local stack and then prod with a probe account):
- mutual follows with both toggles on see `online=true` after a ping and `online=false` plus a `last_active` code after the 90-second window;
- one-way follow, no follow, blocked in either direction, and an opted-out target all return the same row shape as "offline and quiet";
- reciprocity: with the caller's own toggle off, nothing is visible;
- both toggles off writes no row, and turning them off deletes the existing one;
- bucket edges at 60 minutes, 24 hours, 48 hours and 7 days;
- the 20-second write guard, the 50-id cap, `anon` cannot execute, `authenticated` cannot select from `user_presence`;
- `delete_account` leaves no `user_presence` row (the existing residue scan covers the table automatically);
- a request for ids the caller could not otherwise know about reveals nothing.

**Client (vitest):** the hook and store, the phrase mapping including Hindi, heartbeat start and stop on foreground, background and sign-out, `isUserOnline` through the new store, and a source guard that `channel('online-users'` is gone and no client selects `last_seen_at`.

**On a device (after OTA):** two accounts that follow each other see each other's dot within about a minute; flipping either toggle hides it; a non-follower sees nothing.

## 10. Phases and rough size

1. **Server** (one migration + probes): table, `ping_presence`, `get_presence`, grants. Small.
2. **Client** (OTA): heartbeat, hook and store, phrase, settings copy, i18n, remove the channel. Medium; mostly deletion and wiring.
3. **Owner step:** turn off public Realtime channels.
4. **Cleanup migration** (weeks later): drop `profiles.last_seen_at`, `show_active`, `other_last_seen_at`.
5. **Read receipts** (separate PR series): marker column, backfill, `mark_messages_read`, unread-count paths, probes.

## 11. Open points

None blocking. Two defaults chosen here that the owner can overturn at review: the 90-second online window, and the 20-second write guard. A third, reciprocity, is stated in 4.3 and matches today's behaviour.
