# Presence and Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presence (an online dot and a coarse "last active" phrase) visible only to mutual follows and enforced in SQL, plus read receipts that honour the reader's setting.

**Architecture:** A heartbeat upserts one row per active user into a small unlogged table. A `security definer` function, `get_presence(ids[])`, is the only way to read it and applies the follow, block and toggle rules itself. The client polls it for the people on screen and keeps the answer in a small Zustand store that the existing `isUserOnline(id)` reads, so avatars need no change. The global Realtime channel is deleted. Read receipts separate a private per-member read marker (unread counts) from the visible `direct_messages.read_at` (set only when the reader has receipts on).

**Tech Stack:** Postgres 17 (Supabase) migrations and `plpgsql`/`sql` functions; Expo / React Native 0.81, TypeScript, Zustand, vitest; the repo's `scripts/probe-flows.mjs` against the local Supabase stack.

**Spec:** `docs/superpowers/specs/2026-10-16-presence-design.md` (approved by the owner 2026-10-16; PR #258). Read it before starting; this plan implements sections 4 to 10.

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

- Presence is visible only when **both people follow each other** and **neither has blocked the other**.
- Never an exact time. `last_active` is one of `recent` (under 1 hour), `today` (under 24 hours), `yesterday` (under 48 hours), `this_week` (under 7 days), otherwise null. Age-based, not calendar-based.
- **Online** means a heartbeat within `90 seconds`. Heartbeat every `60 seconds`; the server ignores a write if the stored value is under `20 seconds` old. `get_presence` answers at most `50` ids. The client polls every `45 seconds`.
- Two settings with distinct meanings: `online_status` controls the green dot, `activity_status` controls the phrase. `show_active` is dropped in a later cleanup, not in these PRs.
- Reciprocity: if my own `online_status` is off I see no dots; if my own `activity_status` is off I see no phrase.
- Someone not visible, blocked, opted out or a stranger is **indistinguishable** from "offline and quiet": every requested id gets a row, with `online=false, last_active=null`.
- A user with both toggles off is not stored at all (a heartbeat deletes their row).
- Phrases (through `ttx()`): `Active now`, `Active recently`, `Active today`, `Active yesterday`, `Active this week`. Hindi drafts in `lib/i18n/i18nPhrasesHi.ts`, marked `HI: native review needed`.
- **Do not revoke, drop or write `profiles.last_seen_at`**, and keep `get_dm_conversations` returning `other_last_seen_at` (always null): old builds still select both. Closing the public `online-users` Realtime channel is an **owner step** in the dashboard, not a code change.
- Read receipts: `dm_conversation`-level private marker in `dm_read_state`; `direct_messages.read_at` is set only when the reader has `read_receipts` on **and only for messages that were unread at that moment**; unread counts keep their existing meaning (newer than the marker and not followed by a reply of mine); receipts are one-to-one only.
- Repo rules: feature freeze (this is owner-approved work); OTA only, no native changes; **no AI attribution in commits or PR bodies**; every PR body has an "Unverified" section; one concern per PR; the owner merges explicitly ("merge N and push ota"); migrations are validated against the live schema in a transaction that always rolls back before the PR is opened; no edge-function deploys are part of this plan; use `find`, not `ls` (it is aliased to eza); do file edits with Python or the Edit tool (BSD `sed -i` needs `''`); quote globs in zsh.

## File Map

| Path | Responsibility | Series |
|---|---|---|
| `supabase/migrations/20261017120000_presence_server.sql` (create) | `user_presence` table, `ping_presence()`, `get_presence()` | 1 |
| `scripts/probe-flows.mjs` (modify) | probe section `[14]` presence | 1 |
| `lib/social/presenceCore.ts` (create) | store, phrase mapping, heartbeat and polling primitives; no React, no network | 2 |
| `lib/social/presenceCore.test.ts` (create) | tests for the above | 2 |
| `lib/social/presence.ts` (rewrite) | React hooks `usePresenceHeartbeat`, `usePresence`; the Realtime channel is deleted | 2 |
| `lib/supabaseEchoApi.ts` (modify) | `pingPresence`, `fetchPresence`, `fetchMyReadMarker` | 2, 3 |
| `lib/ui/theme.ts` (modify) | `isUserOnline` reads the new store | 2 |
| `app/_layout.tsx`, `app/messages/index.tsx`, `app/messages/[id].tsx`, `app/user/[id].tsx`, `app/group/[id].tsx`, `components/feed/StoryCircles.tsx` (modify) | mount the heartbeat, ask for presence, show the phrase | 2 |
| `app/settings.tsx`, `lib/i18n/i18nPhrasesHi.ts` (modify) | the two toggles' copy; Hindi | 2 |
| `test/presenceChannel.test.ts` (create) | guard against the old channel and `last_seen_at` selects coming back | 2 |
| `lib/social/readState.ts` (+ `.test.ts`, create) | `isReadForViewer` | 3 |
| `hooks/queries/useDMs.ts` (modify) | `useMyReadMarker`; `useMarkRead` invalidates it | 3 |
| `supabase/migrations/20261017130000_read_receipts.sql` (create) | `dm_read_state`, backfill, `mark_messages_read`, `get_my_read_marker`, `get_dm_conversations` unread | 3 |

## Ship order and why

1. **Series 1** (server migration + probes), alone. Presence has no consumer yet, so nothing changes for users.
2. **Series 2** (client, OTA). Needs Series 1 live. Ships to all three OTA runtimes.
3. **Owner step:** after most phones have the new build, turn off public Realtime channels in the Supabase dashboard.
4. **Series 3, client first** (PR 3a: the thread stops depending on `read_at` for what *I* have read, with a graceful fallback if the new RPC is missing) and **only after its OTA has had time to reach phones**, **then** the migration (PR 3b). Reversing this makes old builds whose user has receipts off call `mark_messages_read` once a second, forever, because their partner messages never gain a `read_at`.
5. **Later, not in this plan:** a cleanup migration dropping `profiles.last_seen_at`, `show_active` and the `other_last_seen_at` return column, once old builds are gone.

---

# Series 1: Presence on the server (PR 1)

Branch: `presence/server`, from `main`.

### Task 1: Probes first

**Files:**
- Modify: `scripts/probe-flows.mjs` (insert before the line `console.log('\n[13] Cleanup');` and rename that line to `[15] Cleanup`)

**Interfaces:**
- Consumes: the helpers already in `probe-flows.mjs`: `step`, `must`, `ok`, `mk`, `created`, `admin`, `anon`, `A`/`B` users, `sql`, `skipSql`, `randomUUID`.
- Produces: probe section `[14]`, which Task 2 must make pass.

- [ ] **Step 1: Branch and confirm the local stack is up**

```bash
git checkout main && git pull --ff-only && git checkout -b presence/server
supabase status --workdir ~/.echo-local -o env 2>/dev/null | grep -c API_URL
```
Expected: `1`. If `0`, start it: `supabase start --workdir ~/.echo-local -x logflare,vector`, then `PGPASSWORD=postgres scripts/rebuild-db.sh postgresql://postgres@127.0.0.1:54322/postgres` (a fresh database).

- [ ] **Step 2: Insert the presence probes**

Insert this block immediately before `console.log('\n[13] Cleanup');`, and change that line to `console.log('\n[15] Cleanup');`:

```js
console.log('\n[14] Presence: mutual follows only (docs/superpowers/specs/2026-10-16-presence-design.md)');
let E, F, G, H, I, K;
const presenceOf = async (viewer, ids) => ok(await viewer.client.rpc('get_presence', { p_user_ids: ids }), 'get_presence');
const rowFor = (rows, id) => rows.find(r => r.user_id === id);
const follow = async (a, b) => ok(await a.client.from('follows').insert({ follower_id: a.id, following_id: b.id }), `follow ${a.username}->${b.username}`);
const setAge = (id, age) => sql(`update public.user_presence set last_seen_at = now() - interval '${age}' where user_id = '${id}'`);
const setToggles = async (u, patch) => ok(await u.client.from('profiles').update(patch).eq('id', u.id), 'toggle');
await step('five users: E and F follow each other; G follows E only; H and E follow each other but E blocks H; I follows E back but shares nothing', async () => {
  E = await mk('pe'); F = await mk('pf'); G = await mk('pg'); H = await mk('ph'); I = await mk('pi'); created.push(E.id, F.id, G.id, H.id, I.id);
  await follow(E, F); await follow(F, E);
  await follow(G, E);
  await follow(E, H); await follow(H, E);
  await follow(E, I); await follow(I, E);
  await setToggles(I, { online_status: false, activity_status: false });
  ok(await E.client.from('user_blocks').insert({ blocker_id: E.id, blocked_id: H.id }), 'E blocks H');
});
await step('a mutual follow sees the dot after a heartbeat, and no phrase while online', async () => {
  ok(await E.client.rpc('ping_presence'), 'ping');
  const r = rowFor(await presenceOf(F, [E.id]), E.id);
  must(r && r.online === true && r.last_active == null, `got ${JSON.stringify(r)}`);
});
await step('the profile\'s old last_seen_at is never written (old builds keep selecting it)', async () => {
  const p = ok(await admin.from('profiles').select('last_seen_at').eq('id', E.id).single(), 'profile');
  must(p.last_seen_at === null, `last_seen_at=${p.last_seen_at}`);
});
await step('a one-way follower, a stranger, a blocked user and an opted-out user all look like "offline and quiet"', async () => {
  const hidden = { user_id: E.id, online: false, last_active: null };
  for (const [name, viewer] of [['one-way follower G', G], ['stranger B', B], ['blocked H', H]]) {
    const r = rowFor(await presenceOf(viewer, [E.id]), E.id);
    must(r && r.online === false && r.last_active == null, `${name} got ${JSON.stringify(r)}`);
  }
  ok(await I.client.rpc('ping_presence'), 'ping I');
  const ri = rowFor(await presenceOf(E, [I.id]), I.id);
  must(ri && ri.online === false && ri.last_active == null, `opted-out I got ${JSON.stringify(ri)}`);
  return `${hidden.online}`;
});
await step('every requested id gets a row, including ids that are not users at all', async () => {
  const ghost = randomUUID();
  const rows = await presenceOf(F, [E.id, ghost, ghost]);
  must(rows.length === 2, `${rows.length} rows`);
  const g = rowFor(rows, ghost);
  must(g && g.online === false && g.last_active == null, `ghost row ${JSON.stringify(g)}`);
});
await step('reciprocity: with my own online status off, I see nobody\'s dot', async () => {
  await setToggles(F, { online_status: false });
  const r = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(F, { online_status: true });
  must(r.online === false, 'F saw E\'s dot while hiding their own');
});
await step('an opted-out person writes nothing, and a stored row is deleted when both toggles go off', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${I.id}'`)) === 0, 'I has a presence row');
  await setToggles(E, { online_status: false, activity_status: false });
  ok(await E.client.rpc('ping_presence'), 'ping E');
  const gone = Number(sql(`select count(*) from public.user_presence where user_id = '${E.id}'`));
  await setToggles(E, { online_status: true, activity_status: true });
  ok(await E.client.rpc('ping_presence'), 'ping E again');
  must(gone === 0, 'E\'s row survived turning both toggles off');
});
await step('last-active phrases follow the age, with the edges at 1h, 24h, 48h and 7d', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  const table = [['80 seconds', true, null], ['100 seconds', false, 'recent'], ['59 minutes', false, 'recent'], ['61 minutes', false, 'today'],
    ['23 hours', false, 'today'], ['25 hours', false, 'yesterday'], ['47 hours', false, 'yesterday'], ['49 hours', false, 'this_week'],
    ['6 days', false, 'this_week'], ['8 days', false, null]];
  for (const [age, online, phrase] of table) {
    setAge(E.id, age);
    const r = rowFor(await presenceOf(F, [E.id]), E.id);
    must(r.online === online && (r.last_active ?? null) === phrase, `${age}: expected ${online}/${phrase}, got ${r.online}/${r.last_active}`);
  }
});
await step('"Last active" off hides the phrase; "Online status" off with it on shows the phrase while actually online', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  setAge(E.id, '5 minutes');
  await setToggles(E, { activity_status: false });
  const off = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(E, { activity_status: true, online_status: false });
  ok(await E.client.rpc('ping_presence'), 'ping');
  setAge(E.id, '0 seconds');
  const dotOff = rowFor(await presenceOf(F, [E.id]), E.id);
  await setToggles(E, { online_status: true });
  must(off.last_active == null, `phrase shown with Last active off: ${off.last_active}`);
  must(dotOff.online === false && dotOff.last_active === 'recent', `online-off got ${JSON.stringify(dotOff)}`);
});
await step('heartbeats closer than 20 seconds do not rewrite the row', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  setAge(E.id, '10 seconds');
  ok(await E.client.rpc('ping_presence'), 'early ping');
  const early = Number(sql(`select extract(epoch from now() - last_seen_at) from public.user_presence where user_id = '${E.id}'`));
  setAge(E.id, '30 seconds');
  ok(await E.client.rpc('ping_presence'), 'late ping');
  const late = Number(sql(`select extract(epoch from now() - last_seen_at) from public.user_presence where user_id = '${E.id}'`));
  must(early >= 9, `a ping inside 20 s moved the row (${early}s old)`);
  must(late < 5, `a ping after 30 s did not refresh the row (${late}s old)`);
});
await step('at most 50 ids are answered', async () => {
  const ids = Array.from({ length: 60 }, () => randomUUID());
  const rows = await presenceOf(F, ids);
  must(rows.length === 50, `${rows.length} rows for 60 ids`);
});
await step('anon cannot call either function, and nobody can read the table', async () => {
  const a1 = await anon.rpc('get_presence', { p_user_ids: [E.id] });
  const a2 = await anon.rpc('ping_presence');
  must(a1.error && a2.error, 'anon could call a presence function');
  const t = await F.client.from('user_presence').select('user_id');
  must(t.error || (t.data ?? []).length === 0, `F read ${t.data?.length} presence rows`);
});
await step('deleting an account removes its presence row', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  K = await mk('pk'); created.push(K.id);
  ok(await K.client.rpc('ping_presence'), 'ping K');
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${K.id}'`)) === 1, 'K has no row to delete');
  ok(await K.client.rpc('delete_account'), 'delete_account');
  must(Number(sql(`select count(*) from public.user_presence where user_id = '${K.id}'`)) === 0, 'row survived account deletion');
});
```

- [ ] **Step 3: Run the suite and see the new steps fail**

Run: `node scripts/probe-flows.mjs 2>&1 | grep -E "❌|passed"`
Expected: about 12 `❌` lines mentioning `get_presence` / `ping_presence` "Could not find the function", and a summary like `67 passed, 12 failed`.

- [ ] **Step 4: Commit the failing probes**

```bash
git add scripts/probe-flows.mjs
git commit -m "Presence probes: mutual follows only, coarse phrases, no timestamps, nothing stored for opted-out users"
```

### Task 2: The migration

**Files:**
- Create: `supabase/migrations/20261017120000_presence_server.sql`

**Interfaces:**
- Consumes: `public.profiles(id, online_status, activity_status)`, `public.follows(follower_id, following_id)`, `public.user_blocks(blocker_id, blocked_id)`.
- Produces: `public.user_presence(user_id, last_seen_at)`; `public.ping_presence() returns void`; `public.get_presence(p_user_ids uuid[]) returns table(user_id uuid, online boolean, last_active text)`. Series 2 calls both functions by exactly these names and parameter `p_user_ids`.

- [ ] **Step 1: Create the migration**

```sql
-- Presence, server side. See docs/superpowers/specs/2026-10-16-presence-design.md.
create unlogged table if not exists public.user_presence (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;

create or replace function public.ping_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  if not exists (select 1 from public.profiles p where p.id = me and (p.online_status or p.activity_status)) then
    delete from public.user_presence where user_id = me;
    return;
  end if;
  insert into public.user_presence as up (user_id, last_seen_at)
  values (me, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
   where up.last_seen_at < now() - interval '20 seconds';
end;
$$;
revoke all on function public.ping_presence() from public, anon;
grant execute on function public.ping_presence() to authenticated;

create or replace function public.get_presence(p_user_ids uuid[])
returns table(user_id uuid, online boolean, last_active text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.online_status, p.activity_status from public.profiles p where p.id = auth.uid()
  ),
  asked as (
    select distinct u.id from unnest(p_user_ids[1:50]) as u(id) where u.id is not null
  ),
  seen as (
    select a.id as uid,
           coalesce(
             me.id is not null
             and exists (select 1 from public.follows f where f.follower_id = me.id and f.following_id = a.id)
             and exists (select 1 from public.follows f where f.follower_id = a.id and f.following_id = me.id)
             and not exists (select 1 from public.user_blocks b
                              where (b.blocker_id = me.id and b.blocked_id = a.id)
                                 or (b.blocker_id = a.id and b.blocked_id = me.id)),
             false) as visible,
           t.online_status as t_online, t.activity_status as t_activity,
           me.online_status as m_online, me.activity_status as m_activity,
           up.last_seen_at
      from asked a
      left join me on true
      left join public.profiles t on t.id = a.id
      left join public.user_presence up on up.user_id = a.id
  ),
  calc as (
    select s.*,
           (s.visible and coalesce(s.t_online, false) and coalesce(s.m_online, false)
            and s.last_seen_at is not null and s.last_seen_at > now() - interval '90 seconds') as is_online
      from seen s
  )
  select c.uid, c.is_online,
         case when c.visible and not c.is_online and coalesce(c.t_activity, false) and coalesce(c.m_activity, false)
                   and c.last_seen_at is not null
              then case when now() - c.last_seen_at < interval '1 hour'   then 'recent'
                        when now() - c.last_seen_at < interval '24 hours' then 'today'
                        when now() - c.last_seen_at < interval '48 hours' then 'yesterday'
                        when now() - c.last_seen_at < interval '7 days'   then 'this_week'
                   end
         end
    from calc c;
$$;
revoke all on function public.get_presence(uuid[]) from public, anon;
grant execute on function public.get_presence(uuid[]) to authenticated;
```

- [ ] **Step 2: Apply it to the local stack and run the suite**

```bash
PGPASSWORD=postgres psql postgresql://postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261017120000_presence_server.sql
node scripts/probe-flows.mjs 2>&1 | grep -E "❌|passed"
```
Expected: `79 passed, 0 failed` (the existing 66 plus the 13 new steps) and no `❌` lines.

- [ ] **Step 3: Prove the rebuild path still works** (the recovery bundle replays newer migrations)

```bash
supabase stop --workdir ~/.echo-local --no-backup && supabase start --workdir ~/.echo-local -x logflare,vector
PGPASSWORD=postgres scripts/rebuild-db.sh postgresql://postgres@127.0.0.1:54322/postgres | grep -E "replayed|ERROR"
node scripts/probe-flows.mjs 2>&1 | grep -E "❌|passed"
npx vitest run test/recoveryBundle.test.ts 2>&1 | grep -E "Tests "
```
Expected: `replayed 3 newer migration(s)` (the two grants migrations plus this one; the recovery snapshot is stamped `20261015120000`), no `ERROR`, `79 passed, 0 failed`, `Tests  6 passed`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261017120000_presence_server.sql
git commit -m "Presence on the server: heartbeat table, ping_presence, gated get_presence"
```

### Task 3: Validate on the live schema, open the PR

**Files:** none changed.

- [ ] **Step 1: Run the migration against production's schema in a transaction that always rolls back**

Create `/tmp/presence_live.sql` with the migration between `begin;` and the check, ending in `rollback;`. The check uses two real existing profiles that follow each other if the pair exists (it reads, then rolls back):

```bash
{ echo "begin;"; cat supabase/migrations/20261017120000_presence_server.sql; cat <<'SQL'
do $$
declare a uuid; b uuid; r1 record; msg text;
begin
  select f1.follower_id, f1.following_id into a, b
    from public.follows f1 join public.follows f2 on f2.follower_id = f1.following_id and f2.following_id = f1.follower_id
   limit 1;
  if a is null then
    raise exception 'RESULTS: no mutual-follow pair on prod to test with; shape only: functions=%',
      (select count(*) from pg_proc where proname in ('ping_presence','get_presence'));
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.ping_presence();
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r1 from public.get_presence(array[a]);
  reset role;
  -- Never CALL a function a role has no EXECUTE on from a superuser "set role" session: it can crash the
  -- Postgres backend (documented in the local-dev notes; supautils). Ask the catalog instead.
  msg := 'anon can execute get_presence=' || has_function_privilege('anon', 'public.get_presence(uuid[])', 'execute')
      || ', ping_presence=' || has_function_privilege('anon', 'public.ping_presence()', 'execute')
      || ' | authenticated can select user_presence=' || has_table_privilege('authenticated', 'public.user_presence', 'select')
      || ', anon=' || has_table_privilege('anon', 'public.user_presence', 'select');
  raise exception 'RESULTS: viewer sees online=% last_active=% | % | pair is a real mutual follow', r1.online, r1.last_active, msg;
end $$;
SQL
echo "rollback;"; } > /tmp/presence_live.sql
supabase db query --linked -f /tmp/presence_live.sql 2>&1 | grep -o "RESULTS:[^\\\\]*" | head -1
```
Expected: `RESULTS: viewer sees online=t last_active=<null> | anon can execute get_presence=false, ping_presence=false | authenticated can select user_presence=false, anon=false | pair is a real mutual follow` (or the "no mutual-follow pair" message, which still proves the functions exist and compile on prod's schema; say so in the PR).

- [ ] **Step 2: Confirm nothing persisted**

```bash
echo "select count(*)::text as n from pg_class where relname='user_presence';" > /tmp/chk.sql && supabase db query --linked -f /tmp/chk.sql 2>&1 | grep -o '"n": "[0-9]*"'
```
Expected: `"n": "0"`.

- [ ] **Step 3: Full checks, push, open a draft PR**

```bash
npx vitest run 2>&1 | tail -4 && npm run typecheck 2>&1 | tail -1 && npm run lint 2>&1 | grep problems
git push -u origin presence/server
gh pr create --draft --base main --head presence/server --title "Presence on the server: heartbeat table and gated get_presence (nothing uses it yet)" --body-file /tmp/pr_presence_server.md
```
The PR body (`/tmp/pr_presence_server.md`) states: what it adds; that nothing calls it yet so users see no change; the evidence (local 79 probes, live-schema rolled-back run, nothing persisted); and **Unverified**: not applied to prod; after merge the integration applies it within about a minute, then run `supabase db push --dry-run` and `select count(*) from pg_proc where proname in ('ping_presence','get_presence')` (expect 2). No AI attribution.

- [ ] **Step 4: Wait for the owner's "merge N"**, then merge, poll prod until the function exists, and verify.

```bash
gh pr merge <N> --merge && git checkout main && git pull --ff-only
echo "select count(*)::text as n from pg_proc where proname in ('ping_presence','get_presence');" > /tmp/chk2.sql
for i in 1 2 3 4 5 6; do supabase db query --linked -f /tmp/chk2.sql 2>&1 | grep -o '"n": "[0-9]*"'; sleep 25; done
```
Expected: `"n": "2"` within about a minute. No OTA for this PR.

---

# Series 2: Presence on the client (PR 2, ships as an OTA)

Branch: `presence/client`, from `main` **after Series 1 is live**.

### Task 4: The client core, with tests

**Files:**
- Create: `lib/social/presenceCore.ts`
- Create: `lib/social/presenceCore.test.ts`

**Interfaces:**
- Produces (used by every later task): `type LastActive`, `interface PresenceRow { user_id; online; last_active }`, `interface PresenceEntry { online; lastActive }`, constants `HEARTBEAT_MS`, `POLL_MS`, `MAX_IDS`, `usePresenceStore` (`byUser`, `apply(rows)`, `clear()`), `presencePhrase(entry): string | null`, `createHeartbeat(ping, intervalMs?)`, `startPresencePolling(ids, fetchRows, apply, intervalMs?)`, `presenceIdKey(ids, me): string`.
- This module imports only `zustand`, so it loads in the node test project and in `lib/ui/theme.ts` without pulling the API layer in.

- [ ] **Step 1: Write the tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_MS, MAX_IDS, POLL_MS, createHeartbeat, presenceIdKey, presencePhrase, startPresencePolling, usePresenceStore,
} from './presenceCore';

beforeEach(() => { vi.useFakeTimers(); usePresenceStore.getState().clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('presencePhrase', () => {
  it('says nothing without an entry or a code', () => {
    expect(presencePhrase(undefined)).toBeNull();
    expect(presencePhrase({ online: false, lastActive: null })).toBeNull();
  });
  it('says "Active now" for an online person, whatever the code', () => {
    expect(presencePhrase({ online: true, lastActive: null })).toBe('Active now');
    expect(presencePhrase({ online: true, lastActive: 'today' })).toBe('Active now');
  });
  it('maps every code to its phrase', () => {
    expect(presencePhrase({ online: false, lastActive: 'recent' })).toBe('Active recently');
    expect(presencePhrase({ online: false, lastActive: 'today' })).toBe('Active today');
    expect(presencePhrase({ online: false, lastActive: 'yesterday' })).toBe('Active yesterday');
    expect(presencePhrase({ online: false, lastActive: 'this_week' })).toBe('Active this week');
  });
});

describe('usePresenceStore', () => {
  it('keeps the latest answer per person and merges new rows over old ones', () => {
    const { apply } = usePresenceStore.getState();
    apply([{ user_id: 'a', online: true, last_active: null }, { user_id: 'b', online: false, last_active: 'today' }]);
    apply([{ user_id: 'a', online: false, last_active: 'recent' }]);
    expect(usePresenceStore.getState().byUser).toEqual({
      a: { online: false, lastActive: 'recent' },
      b: { online: false, lastActive: 'today' },
    });
  });
  it('clears on sign-out', () => {
    usePresenceStore.getState().apply([{ user_id: 'a', online: true, last_active: null }]);
    usePresenceStore.getState().clear();
    expect(usePresenceStore.getState().byUser).toEqual({});
  });
});

describe('createHeartbeat', () => {
  it('pings at once, then every minute, and stops cleanly', () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(ping);
    hb.start();
    expect(ping).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(ping).toHaveBeenCalledTimes(4);
    hb.stop();
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(ping).toHaveBeenCalledTimes(4);
    expect(hb.running).toBe(false);
  });
  it('starting twice does not double the rate', () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(ping);
    hb.start(); hb.start();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(ping).toHaveBeenCalledTimes(2);
    hb.stop();
  });
  it('survives a failing ping', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('offline'));
    const hb = createHeartbeat(ping);
    expect(() => hb.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(ping).toHaveBeenCalledTimes(2);
    hb.stop();
  });
});

describe('startPresencePolling', () => {
  it('fetches now and every 45 seconds, applying each answer', async () => {
    const rows = [{ user_id: 'a', online: true, last_active: null }];
    const fetchRows = vi.fn().mockResolvedValue(rows);
    const apply = vi.fn();
    const stop = startPresencePolling(['a'], fetchRows, apply);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRows).toHaveBeenCalledWith(['a']);
    expect(apply).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(apply).toHaveBeenCalledTimes(2);
    stop();
  });
  it('drops an answer that arrives after stop, and a failed poll changes nothing', async () => {
    let resolve!: (r: never[]) => void;
    const slow = vi.fn(() => new Promise<never[]>(r => { resolve = r; }));
    const apply = vi.fn();
    const stop = startPresencePolling(['a'], slow, apply);
    stop();
    resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(apply).not.toHaveBeenCalled();

    const failing = vi.fn().mockRejectedValue(new Error('network'));
    const stop2 = startPresencePolling(['a'], failing, apply);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(apply).not.toHaveBeenCalled();
    stop2();
  });
});

describe('presenceIdKey', () => {
  it('is unique, excludes me and nulls, sorted, and capped at 50', () => {
    expect(presenceIdKey(['b', 'a', 'b', null, undefined, 'me'], 'me')).toBe('a,b');
    const many = Array.from({ length: 80 }, (_, i) => `id${String(i).padStart(3, '0')}`);
    expect(presenceIdKey(many, null).split(',')).toHaveLength(MAX_IDS);
  });
  it('is empty when there is nobody to ask about', () => {
    expect(presenceIdKey([], 'me')).toBe('');
    expect(presenceIdKey(['me'], 'me')).toBe('');
  });
});
```
Save as `lib/social/presenceCore.test.ts`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run lib/social/presenceCore.test.ts 2>&1 | grep -E "Tests|rror"`
Expected: a failure to resolve `./presenceCore`.

- [ ] **Step 3: Write the module**

```ts
import { create } from 'zustand';

/** What `get_presence` returns for one person. `last_active` is a code, never a timestamp. */
export type LastActive = 'recent' | 'today' | 'yesterday' | 'this_week';
export interface PresenceRow { user_id: string; online: boolean; last_active: LastActive | null }
export interface PresenceEntry { online: boolean; lastActive: LastActive | null }

export const HEARTBEAT_MS = 60_000;
export const POLL_MS = 45_000;
export const MAX_IDS = 50;

interface PresenceState {
  byUser: Record<string, PresenceEntry>;
  apply: (rows: PresenceRow[]) => void;
  clear: () => void;
}

/** The latest answer from the server, keyed by user id. Not persisted: presence is only ever "now". */
export const usePresenceStore = create<PresenceState>(set => ({
  byUser: {},
  apply: rows => set(state => {
    const next = { ...state.byUser };
    for (const row of rows) next[row.user_id] = { online: row.online, lastActive: row.last_active ?? null };
    return { byUser: next };
  }),
  clear: () => set({ byUser: {} }),
}));

const PHRASES: Record<LastActive, string> = {
  recent: 'Active recently',
  today: 'Active today',
  yesterday: 'Active yesterday',
  this_week: 'Active this week',
};

/**
 * The English phrase for a person's presence, or null when there is nothing to say. Callers pass it
 * through ttx(): the keys here are the translation keys.
 */
export function presencePhrase(entry: PresenceEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.online) return 'Active now';
  return entry.lastActive ? PHRASES[entry.lastActive] : null;
}

/** Pings `ping` now and then every `intervalMs` until stopped. A failed ping is ignored: the next one retries. */
export function createHeartbeat(ping: () => Promise<unknown>, intervalMs = HEARTBEAT_MS) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => { void ping().catch(() => {}); };
  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    get running() { return timer !== null; },
  };
}

/**
 * Asks for `ids` now and then every `intervalMs`, handing each answer to `apply`. Presence is
 * decoration: a failed poll leaves the last answer in place and never throws. Returns a stop function;
 * an answer that arrives after stop() is dropped.
 */
export function startPresencePolling(
  ids: string[],
  fetchRows: (ids: string[]) => Promise<PresenceRow[]>,
  apply: (rows: PresenceRow[]) => void,
  intervalMs = POLL_MS,
): () => void {
  let stopped = false;
  const run = async () => {
    try {
      const rows = await fetchRows(ids);
      if (!stopped) apply(rows);
    } catch {
      // keep what we have
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}

/** The ids worth asking about: unique, not me, sorted (a stable key), at most MAX_IDS. */
export function presenceIdKey(ids: (string | null | undefined)[], me: string | null | undefined): string {
  const clean = Array.from(new Set(ids.filter((id): id is string => !!id && id !== me))).sort();
  return clean.slice(0, MAX_IDS).join(',');
}
```
Save as `lib/social/presenceCore.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/social/presenceCore.test.ts 2>&1 | grep -E "Tests"`
Expected: `Tests  12 passed (12)`.

- [ ] **Step 5: Commit**

```bash
git add lib/social/presenceCore.ts lib/social/presenceCore.test.ts
git commit -m "Presence client core: store, phrases, heartbeat and polling primitives"
```

### Task 5: API calls, hooks, and the theme lookup

**Files:**
- Modify: `lib/supabaseEchoApi.ts` (add after `markMessagesRead`, which ends near line 4075)
- Rewrite: `lib/social/presence.ts`
- Modify: `lib/ui/theme.ts:4`, `:403`, `:461`

**Interfaces:**
- Consumes: Task 4's exports.
- Produces: `pingPresence(): Promise<void>`, `fetchPresence(ids: string[]): Promise<PresenceRow[]>` in the API layer; `usePresenceHeartbeat(userId: string | undefined)` and `usePresence(ids: (string | null | undefined)[])` hooks; `isUserOnline(id)` unchanged in signature.

- [ ] **Step 1: Add the API functions** (screens must not call `supabase` directly)

In `lib/supabaseEchoApi.ts`, add near the top with the other type imports `import type { PresenceRow } from './social/presenceCore';`, and add after `markMessagesRead`:

```ts
/** Heartbeat. Tells the server this person is active now; the server decides whether to store it. */
export async function pingPresence(): Promise<void> {
  const { error } = await supabase.rpc('ping_presence');
  if (error) throw error;
}

/**
 * Presence for up to 50 people. The server answers for mutual follows only; everyone else comes back
 * offline and quiet, so the answer cannot be used to learn who follows or blocks whom.
 */
export async function fetchPresence(ids: string[]): Promise<PresenceRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('get_presence', { p_user_ids: ids });
  if (error) throw error;
  return (data ?? []) as PresenceRow[];
}
```

- [ ] **Step 2: Replace `lib/social/presence.ts` entirely**

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetchPresence, pingPresence } from '../supabaseEchoApi';
import { useAppStore } from '../../store/useAppStore';
import {
  createHeartbeat, presenceIdKey, startPresencePolling, usePresenceStore, type PresenceRow,
} from './presenceCore';

// Presence over the database, not a Realtime channel. The old design put every signed-in client on one
// public channel that handed everyone the whole online list and was enforced only in this file.
// Now the server decides who may see whom (get_presence), and the client asks only about the people on
// screen. See docs/superpowers/specs/2026-10-16-presence-design.md.

/**
 * Mount once, in the root layout. Pings once a minute while the app is in the foreground, and clears the
 * store on sign-out. If the person shares nothing (both toggles off) it sends one last ping so the server
 * deletes whatever it stored, then stays quiet.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  const sharesAnything = useAppStore(s => s.onlineStatus || s.activityStatus);

  useEffect(() => () => usePresenceStore.getState().clear(), [userId]);

  useEffect(() => {
    if (!userId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    if (!sharesAnything) {
      void pingPresence().catch(() => {});
      return;
    }
    const heartbeat = createHeartbeat(pingPresence);
    if (AppState.currentState === 'active') heartbeat.start();
    const sub = AppState.addEventListener('change', state => (state === 'active' ? heartbeat.start() : heartbeat.stop()));
    return () => { sub.remove(); heartbeat.stop(); };
  }, [userId, sharesAnything]);
}

/**
 * Keeps presence fresh for the people on this screen: asks now and every 45 seconds while the app is in the
 * foreground. Read the answers with `usePresenceStore` or `isUserOnline(id)`. Safe to call from several
 * screens at once; each asks only about its own ids.
 */
export function usePresence(ids: (string | null | undefined)[]) {
  const me = useAppStore(s => s.userId);
  const key = presenceIdKey(ids, me);

  useEffect(() => {
    if (!me || !key || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const list = key.split(',');
    const apply = (rows: PresenceRow[]) => usePresenceStore.getState().apply(rows);
    let stop: (() => void) | null = null;
    const begin = () => { stop?.(); stop = startPresencePolling(list, fetchPresence, apply); };
    if (AppState.currentState === 'active') begin();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') begin();
      else { stop?.(); stop = null; }
    });
    return () => { sub.remove(); stop?.(); };
  }, [me, key]);
}
```

- [ ] **Step 3: Point the theme at the new store** with a small Python edit

```bash
python3 - <<'PY'
p='lib/ui/theme.ts'; s=open(p).read()
for old,new in [
  ("import { usePresenceStore } from '../social/presence';","import { usePresenceStore } from '../social/presenceCore';"),
  ("const presenceIds = usePresenceStore(s => s.onlineIds);","const presenceByUser = usePresenceStore(s => s.byUser);"),
  ("return onlineStatus && presenceIds.has(userId);","return onlineStatus && presenceByUser[userId]?.online === true;"),
]:
    assert s.count(old)==1,(old,s.count(old)); s=s.replace(old,new)
open(p,'w').write(s)
PY
npm run typecheck 2>&1 | tail -5
```
Expected: errors only in files that still import `usePresenceTracking` (fixed in Task 6): `app/_layout.tsx`, `app/messages/index.tsx`, `app/messages/[id].tsx`.

- [ ] **Step 4: Commit**

```bash
git add lib/supabaseEchoApi.ts lib/social/presence.ts lib/ui/theme.ts
git commit -m "Presence client: heartbeat and polling hooks over get_presence; theme reads the new store"
```

### Task 6: Screens

**Files:**
- Modify: `app/_layout.tsx:41`, `:303`
- Modify: `app/messages/index.tsx:27`, `:682`, after the `conversations` const (about `:734`)
- Modify: `app/messages/[id].tsx:80`, `:169`, `:282-296`, `:2029`, `:2084`, `:2229`, `:3031`
- Modify: `app/user/[id].tsx` (`ProfileHeader`, near `:125-126` and `:223`)
- Modify: `app/group/[id].tsx` (after `:53`)
- Modify: `components/feed/StoryCircles.tsx` (after `const stories = getActiveStories();`)

**Interfaces:**
- Consumes: `usePresenceHeartbeat`, `usePresence`, `usePresenceStore`, `presencePhrase`.

- [ ] **Step 1: Root layout.** In `app/_layout.tsx` change the import on line 41 to `import { usePresenceHeartbeat } from '../lib/social/presence';` and line 303 to `usePresenceHeartbeat(userId ?? undefined);`.

- [ ] **Step 2: Inbox.** In `app/messages/index.tsx` change the import on line 27 to `import { usePresence } from '../../lib/social/presence';`, delete line 682 (`usePresenceTracking(useAppStore(s => s.userId) ?? undefined);`), and add directly after the `const conversations: InboxConversation[] = ... : localConversations;` statement:

```ts
  usePresence(conversations.map(c => (c.isGroup ? null : c.userId)));
```

- [ ] **Step 3: Thread.** In `app/messages/[id].tsx`:
  - line 80: `import { usePresence } from '../../lib/social/presence';` and add `import { presencePhrase, usePresenceStore } from '../../lib/social/presenceCore';`
  - delete line 2029 (`usePresenceTracking(remote ? (userId ?? undefined) : undefined);`)
  - delete the `formatLastSeen` function (lines 282 to its closing brace) and the `otherLastSeenAt?: string | null;` field on line 169 and the `otherLastSeenAt: remoteConvData.otherLastSeenAt,` line near 2084
  - immediately before the line `const online = conversation && !conversation.isGroup && conversation.userId ? isUserOnline(conversation.userId) : false;` (near 2229) add:

```ts
  usePresence(conversation && !conversation.isGroup ? [conversation.userId] : []);
  const presence = usePresenceStore(s => (conversation && !conversation.isGroup ? s.byUser[conversation.userId] : undefined));
  const presenceText = presencePhrase(presence);
```
  - in the header (near 3031) replace `: online ? 'Active now' : conversation.otherLastSeenAt ? formatLastSeen(conversation.otherLastSeenAt) : \`@${conversation.username}\`` with `: presenceText ? ttx(presenceText) : \`@${conversation.username}\``

- [ ] **Step 4: Profile.** In `ProfileHeader` (`app/user/[id].tsx`) add `import { usePresence } from '../../lib/social/presence';` and `import { presencePhrase, usePresenceStore } from '../../lib/social/presenceCore';`, then directly after `const online = isUserOnline(user.id);`:

```ts
  usePresence(isSelf ? [] : [user.id]);
  const presenceText = presencePhrase(usePresenceStore(s => s.byUser[user.id]));
```
  and replace the line `{online && <Text style={{ color: colors.success, fontSize: fontSizes.meta, marginBottom: 8 }}>{ttx("Active now")}</Text>}` with:

```tsx
        {!isSelf && presenceText && (
          <Text style={{ color: online ? colors.success : colors.textMuted, fontSize: fontSizes.meta, marginBottom: 8 }}>{ttx(presenceText)}</Text>
        )}
```

- [ ] **Step 5: Groups and stories.** In `app/group/[id].tsx`, add `import { usePresence } from '../../lib/social/presence';` and directly after `const [members, setMembers] = useState<GroupMember[]>([]);` add `usePresence(members.map(m => m.userId));`. In `components/feed/StoryCircles.tsx`, add the same import (`'../../lib/social/presence'`) and directly after `const stories = getActiveStories();` add `usePresence(stories.map(s => s.userId));`.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck 2>&1 | tail -3
git add app components
git commit -m "Presence on screen: heartbeat in the root layout, presence for inbox, thread, profile, groups and stories"
```
Expected: typecheck prints nothing after the `tsc --noEmit` line.

### Task 7: Settings copy, Hindi, and the guard test

**Files:**
- Modify: `app/settings.tsx:1026`, `:1028`
- Modify: `lib/i18n/i18nPhrasesHi.ts` (append inside `HI_BULK`, before the closing `};`)
- Create: `test/presenceChannel.test.ts`

- [ ] **Step 1: Write the guard test first**

```ts
/**
 * Presence used to run on one global, public Realtime channel that handed every client the whole online
 * list, enforced only in the client. It runs through get_presence now. This keeps the channel, the old
 * hook, and the last-seen column from creeping back into the client.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) yield* sources(rel);
    else if (/\.tsx?$/.test(rel) && !/\.test\.tsx?$/.test(rel)) yield rel;
  }
}
const all = ['app', 'lib', 'components', 'hooks', 'store'].flatMap(d => [...sources(d)]).map(f => [f, readFileSync(join(ROOT, f), 'utf8')] as const);

describe('presence stays behind get_presence', () => {
  it('no client opens the global online-users channel', () => {
    const hits = all.filter(([, t]) => /channel\(\s*['"`]online-users/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('the old tracking hook is gone', () => {
    const hits = all.filter(([, t]) => /usePresenceTracking/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('no client selects profiles.last_seen_at (old builds still do; new ones must not)', () => {
    const hits = all.filter(([, t]) => /avatar_url, last_seen_at/.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
  it('the theme reads presence from the core store, not the API layer', () => {
    const theme = readFileSync(join(ROOT, 'lib/ui/theme.ts'), 'utf8');
    expect(theme).toMatch(/social\/presenceCore/);
    expect(theme).not.toMatch(/social\/presence['"]/);
  });
});
```

- [ ] **Step 2: Run it and see it fail on the `last_seen_at` select** (the old select is still at `lib/supabaseEchoApi.ts:4025`)

Run: `npx vitest run test/presenceChannel.test.ts 2>&1 | grep -E "×|Tests|supabaseEchoApi"`
Expected: one failure naming `lib/supabaseEchoApi.ts`.

- [ ] **Step 3: Remove the select.** In `lib/supabaseEchoApi.ts` change `.select('id, username, display_name, avatar_color, avatar_url, last_seen_at')` to `.select('id, username, display_name, avatar_color, avatar_url')`, delete the comment above it about `last_seen_at` (42501), and change the line that maps it (`otherLastSeenAt: (profile?.last_seen_at as string | null) ?? null,`) to `otherLastSeenAt: null,`. The `RemoteConversation.otherLastSeenAt` field stays until the cleanup migration.

- [ ] **Step 4: Settings copy.** Replace the two rows in `app/settings.tsx`:

```tsx
<SettingsRow theme={theme} icon={Eye} label={ttx("Last active")} subtitle={ttx("Show roughly when you were last active, like 'Active today', to people who follow you back")} right={SwitchEl(s.activityStatus, handleActivityStatus)} />
```
(replaces the `Activity Status` row at line 1026) and

```tsx
<SettingsRow theme={theme} icon={EyeSlash} label={ttx("Online status")} subtitle={ttx("Show a green dot to people who follow you back")} right={SwitchEl(s.onlineStatus, handleOnlineStatus)} />
```
(replaces the `Online Status` row at line 1028). Keep the handlers and icons.

- [ ] **Step 5: Hindi drafts.** First confirm none exist: `grep -c "Active recently\|Online status\|Last active" lib/i18n/i18nPhrasesHi.ts lib/i18n/i18nPhrases.ts` should print `0` for both. Then add before the closing `};` of `HI_BULK`:

```ts
  // Presence. HI: native review needed.
  'Active recently': 'हाल ही में सक्रिय',
  'Active today': 'आज सक्रिय',
  'Active yesterday': 'कल सक्रिय',
  'Active this week': 'इस हफ़्ते सक्रिय',
  'Online status': 'ऑनलाइन स्थिति',
  'Last active': 'आख़िरी बार सक्रिय',
  'Show a green dot to people who follow you back': 'जो लोग आपको वापस फ़ॉलो करते हैं, उन्हें हरा बिंदु दिखाएं',
  "Show roughly when you were last active, like 'Active today', to people who follow you back": "जो लोग आपको वापस फ़ॉलो करते हैं, उन्हें मोटे तौर पर दिखाएं कि आप आख़िरी बार कब सक्रिय थे, जैसे 'आज सक्रिय'",
```
(`'Active now'` already exists.)

- [ ] **Step 6: Run everything**

```bash
npx vitest run 2>&1 | tail -4
npm run typecheck 2>&1 | tail -1
npm run lint 2>&1 | grep problems
```
Expected: all tests pass (the new 12 core tests and 4 guard tests included), typecheck clean, lint `185 warnings` (no new warnings; if a new unused-import warning appears, remove the import it names).

- [ ] **Step 7: Commit**

```bash
git add app/settings.tsx lib/i18n/i18nPhrasesHi.ts lib/supabaseEchoApi.ts test/presenceChannel.test.ts
git commit -m "Presence settings: two toggles that mean what they say; Hindi drafts; guard against the old channel"
```

### Task 8: Open the PR, ship the OTA, check on a device

- [ ] **Step 1: Push and open the draft PR**

```bash
git push -u origin presence/client
gh pr create --draft --base main --head presence/client --title "Presence on screen: dot and coarse last-active for mutual follows (client)" --body-file /tmp/pr_presence_client.md
```
Body: what changed and what was deleted (the global channel and its hook); evidence (tests, typecheck, lint); the rollout traps from the spec section 6; and **Unverified**: not run on a device; needs Series 1 live; steps to check with two accounts that follow each other (dot within about a minute, flipping either toggle hides it, a non-follower sees nothing, DM header shows the phrase). No AI attribution.

- [ ] **Step 2: On "merge N and push ota"**, merge and publish to all three runtimes with the shipping procedure in the appendix.

- [ ] **Step 3: Check on the emulator with two accounts that follow each other** (the owner supplies the second account; never create accounts): after two relaunches, open a DM with the other person and expect `Active now` in the header while both apps are open, and `Active recently` after one app is backgrounded for two minutes. Flip "Online status" off on one side and confirm the other side's dot disappears within a minute.

- [ ] **Step 4: Tell the owner the dashboard step**: turn off public Realtime channels once most phones have the new build. Until then old builds still announce on the public channel.

---

# Series 3: Read receipts

Two PRs, **client first**. See "Ship order and why".

## PR 3a: the thread stops depending on `read_at` for what I have read (client)

Branch: `receipts/client`, from `main`.

### Task 9: `isReadForViewer`, with tests

**Files:**
- Create: `lib/social/readState.ts`
- Create: `lib/social/readState.test.ts`

**Interfaces:**
- Produces: `isReadForViewer(msg: { senderId: string; createdAt: string; readAt: string | null }, viewerId: string, marker: string | null | undefined): boolean`.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { isReadForViewer } from './readState';

const me = 'me';
const msg = (over: Partial<{ senderId: string; createdAt: string; readAt: string | null }> = {}) =>
  ({ senderId: 'them', createdAt: '2026-10-16T10:00:00Z', readAt: null, ...over });

describe('isReadForViewer', () => {
  it('a message with a receipt is read', () => {
    expect(isReadForViewer(msg({ readAt: '2026-10-16T10:05:00Z' }), me, null)).toBe(true);
  });
  it('their message older than my private marker is read, even with no receipt', () => {
    expect(isReadForViewer(msg(), me, '2026-10-16T10:30:00Z')).toBe(true);
    expect(isReadForViewer(msg({ createdAt: '2026-10-16T10:30:00Z' }), me, '2026-10-16T10:30:00Z')).toBe(true);
  });
  it('their message newer than my marker is unread', () => {
    expect(isReadForViewer(msg({ createdAt: '2026-10-16T11:00:00Z' }), me, '2026-10-16T10:30:00Z')).toBe(false);
  });
  it('with no marker (the server function is missing, or a brand new chat) only a receipt counts', () => {
    expect(isReadForViewer(msg(), me, null)).toBe(false);
    expect(isReadForViewer(msg(), me, undefined)).toBe(false);
  });
  it('my own messages are read only when the partner has a receipt, whatever my marker says', () => {
    expect(isReadForViewer(msg({ senderId: me }), me, '2026-10-17T00:00:00Z')).toBe(false);
    expect(isReadForViewer(msg({ senderId: me, readAt: '2026-10-16T10:05:00Z' }), me, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, see it fail, then write the module**

Run: `npx vitest run lib/social/readState.test.ts 2>&1 | grep -E "Tests|rror"` (expect a resolve failure). Then create `lib/social/readState.ts`:

```ts
export interface ReadableMessage { senderId: string; createdAt: string; readAt: string | null }

/**
 * Has the VIEWER read this message?
 *
 * A message with a receipt (`readAt`) is read. For someone else's message there is also my private
 * marker: the time I last opened the conversation, kept on the server whether or not I send receipts.
 * Without that, a person who turns receipts off would see every partner message as unread forever.
 * My own messages are read only when the partner has sent a receipt; my marker says nothing about them.
 */
export function isReadForViewer(msg: ReadableMessage, viewerId: string, marker: string | null | undefined): boolean {
  if (msg.readAt) return true;
  if (msg.senderId === viewerId) return false;
  return !!marker && Date.parse(msg.createdAt) <= Date.parse(marker);
}
```
Expected after: `Tests  5 passed (5)`.

- [ ] **Step 3: Commit**

```bash
git add lib/social/readState.ts lib/social/readState.test.ts
git commit -m "isReadForViewer: what I have read comes from my private marker as well as receipts"
```

### Task 10: The marker query and the thread

**Files:**
- Modify: `lib/supabaseEchoApi.ts` (add `fetchMyReadMarker` after `markMessagesRead`)
- Modify: `hooks/queries/useDMs.ts` (add `useMyReadMarker`; `useMarkRead` invalidates it)
- Modify: `app/messages/[id].tsx:2121`, `:2150`, `:2307-2334`

**Interfaces:**
- Consumes: Task 9's `isReadForViewer`; the RPC `get_my_read_marker(p_conversation_id)` that does not exist until PR 3b.
- Produces: `fetchMyReadMarker(conversationId): Promise<string | null>` (returns null if the RPC is missing or fails, which is the fallback to today's behaviour); `useMyReadMarker(conversationId)`.

- [ ] **Step 1: API function**

```ts
/**
 * The time I last opened this conversation, kept privately on the server. Null when there is none yet, or
 * when the server does not have the function (before the read-receipts migration): callers then fall back
 * to receipts alone, which is how the app behaved before.
 */
export async function fetchMyReadMarker(conversationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_read_marker', { p_conversation_id: conversationId });
  if (error) return null;
  return (data as string | null) ?? null;
}
```

- [ ] **Step 2: Hook, and invalidate it when messages are marked read.** In `hooks/queries/useDMs.ts` add `fetchMyReadMarker` to the import list from `'../../lib/supabaseEchoApi'`, then add:

```ts
/** My private read marker for a conversation; see isReadForViewer. */
export function useMyReadMarker(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['read-marker', conversationId],
    enabled: !!conversationId && isSupabaseRemote(),
    staleTime: 0,
    queryFn: () => fetchMyReadMarker(conversationId!),
  });
}
```
and in `useMarkRead`'s `onSuccess` add `qc.invalidateQueries({ queryKey: ['read-marker', conversationId] });`.

- [ ] **Step 3: Use it in the thread.** In `app/messages/[id].tsx`: import `useMyReadMarker` from `'../../hooks/queries/useDMs'` and `isReadForViewer` from `'../../lib/social/readState'`; after `const { mutate: doMarkRead } = useMarkRead();` (line 2121) add

```ts
  const { data: readMarker, isLoading: markerLoading } = useMyReadMarker(remote ? id : undefined);
```
change the message mapping `isRead: !!m.readAt,` (line 2150) to `isRead: isReadForViewer({ senderId: m.senderId, createdAt: m.createdAt, readAt: m.readAt }, myId, readMarker),`, and make both effects wait for the marker so the "New messages" divider is anchored before mark-read moves it:

```ts
  useEffect(() => {
    if (unreadSnapshotTaken.current || messages.length === 0 || markerLoading) return;
```
(replacing the first line of the snapshot effect, dependency list `[messages.length, markerLoading]`), and in the mark-read effect change `if (!remote || !id || markingReadRef.current) return;` to `if (!remote || !id || markingReadRef.current || markerLoading) return;` with `markerLoading` added to its dependency list.

- [ ] **Step 4: Run everything and commit**

```bash
npx vitest run 2>&1 | tail -4 && npm run typecheck 2>&1 | tail -1 && npm run lint 2>&1 | grep problems
git add -A lib hooks app && git commit -m "Thread: what I have read comes from my private marker, so the divider and mark-read do not depend on receipts"
```
Expected: tests pass, typecheck clean, lint `185 warnings`.

- [ ] **Step 5: PR, then OTA on "merge N and push ota".** Body states what it does today (nothing visible: the RPC is missing, so it falls back to receipts) and **Unverified**: not run on a device; after 3b lands, a user with receipts off must not see an unread divider that never clears, or a mark-read call every second (check the network log on the emulator). Do **not** start PR 3b until this OTA has had a few days to reach phones.

## PR 3b: the migration

Branch: `receipts/server`, from `main` **after PR 3a's OTA has had time to land**.

### Task 11: Probes first

**Files:**
- Modify: `scripts/probe-flows.mjs` (insert before `console.log('\n[15] Cleanup');` and rename that line to `[17] Cleanup`)

- [ ] **Step 1: Insert**

```js
console.log('\n[16] Read receipts keep their promise (docs/superpowers/specs/2026-10-16-presence-design.md, section 8)');
let P, Q, R, S2, convP;
const convIdOf = (c) => (typeof c === 'string' ? c : (c.id ?? c.conversation_id));
const unreadOf = async (u, cid) => {
  const list = ok(await u.client.rpc('get_dm_conversations'), 'get_dm_conversations');
  const row = list.find(r => r.id === cid);
  must(row, 'the conversation is missing from the list');
  return Number(row.unread_count);
};
const say = async (from, cid, text) => ok(await from.client.from('direct_messages').insert({ id: randomUUID(), conversation_id: cid, sender_id: from.id, kind: 'text', text }), 'send');
const readAts = async (cid, senderId) => ok(await admin.from('direct_messages').select('read_at').eq('conversation_id', cid).eq('sender_id', senderId).order('created_at'), 'read_at').map(r => r.read_at);
await step('two users open a conversation; three messages arrive unread for the receiver only', async () => {
  P = await mk('rp'); Q = await mk('rq'); R = await mk('rr'); created.push(P.id, Q.id, R.id);
  convP = convIdOf(ok(await Q.client.rpc('get_or_create_dm_conversation', { p_recipient_id: P.id }), 'conversation'));
  for (const t of ['one', 'two', 'three']) await say(Q, convP, t);
  must(await unreadOf(P, convP) === 3, 'P should have 3 unread');
  must(await unreadOf(Q, convP) === 0, 'Q should have 0 unread');
});
await step('with receipts on, reading clears the count AND sets the receipt the sender sees', async () => {
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark');
  must(await unreadOf(P, convP) === 0, 'unread should be 0 after reading');
  const ats = await readAts(convP, Q.id);
  must(ats.length === 3 && ats.every(Boolean), `receipts: ${JSON.stringify(ats)}`);
  const marker = ok(await P.client.rpc('get_my_read_marker', { p_conversation_id: convP }), 'marker');
  must(marker, 'no private marker after reading');
});
await step('with receipts OFF, reading clears the count but the sender sees nothing', async () => {
  ok(await P.client.from('profiles').update({ read_receipts: false }).eq('id', P.id), 'receipts off');
  await say(Q, convP, 'four'); await say(Q, convP, 'five');
  must(await unreadOf(P, convP) === 2, 'P should have 2 unread');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark');
  must(await unreadOf(P, convP) === 0, 'unread should be 0 after reading with receipts off');
  const ats = await readAts(convP, Q.id);
  must(ats.slice(3).every(a => a === null), `the sender can see receipts for messages read with receipts off: ${JSON.stringify(ats)}`);
});
await step('turning receipts back on does not reveal what was read while they were off', async () => {
  ok(await P.client.from('profiles').update({ read_receipts: true }).eq('id', P.id), 'receipts on');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark again');
  const ats = await readAts(convP, Q.id);
  must(ats.slice(3).every(a => a === null), 'earlier private reads became visible');
  await say(Q, convP, 'six');
  ok(await P.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'mark six');
  must((await readAts(convP, Q.id))[5] !== null, 'a new message read with receipts on should show a receipt');
});
await step('replying counts as having read (the existing rule is kept)', async () => {
  await say(Q, convP, 'seven');
  await say(P, convP, 'reply from P');
  must(await unreadOf(P, convP) === 0, 'a message before my own reply should not count as unread');
});
await step('a stranger can neither read the marker nor mark someone else\'s conversation', async () => {
  const m = ok(await R.client.rpc('get_my_read_marker', { p_conversation_id: convP }), 'marker as stranger');
  must(m === null, 'a stranger got a marker');
  await say(Q, convP, 'eight');
  ok(await R.client.rpc('mark_messages_read', { p_conversation_id: convP }), 'stranger mark');
  const last = (await readAts(convP, Q.id)).slice(-1)[0];
  must(last === null, 'a stranger set a receipt on a conversation they are not in');
});
await step('nobody can read dm_read_state directly', async () => {
  const t = await P.client.from('dm_read_state').select('user_id');
  must(t.error || (t.data ?? []).length === 0, `P read ${t.data?.length} rows`);
});
await step('deleting an account removes its read markers', async () => {
  if (skipSql) return 'skipped (no PROBE_DB_URL)';
  S2 = await mk('rs'); created.push(S2.id);
  const cid = convIdOf(ok(await S2.client.rpc('get_or_create_dm_conversation', { p_recipient_id: P.id }), 'conv'));
  await say(P, cid, 'hello S');
  ok(await S2.client.rpc('mark_messages_read', { p_conversation_id: cid }), 'mark');
  must(Number(sql(`select count(*) from public.dm_read_state where user_id = '${S2.id}'`)) === 1, 'S has no marker to delete');
  ok(await S2.client.rpc('delete_account'), 'delete_account');
  must(Number(sql(`select count(*) from public.dm_read_state where user_id = '${S2.id}'`)) === 0, 'marker survived account deletion');
});
```

- [ ] **Step 2: Run and see failures** (the presence section from Series 1 must already be in `main`)

Run: `node scripts/probe-flows.mjs 2>&1 | grep -E "❌|passed"`
Expected: five `❌` lines, one of them `the sender can see receipts for messages read with receipts off`, and `82 passed, 5 failed` (or the equivalent counts for the current base).

- [ ] **Step 3: Commit** `git add scripts/probe-flows.mjs && git commit -m "Read receipt probes: the toggle must hide what was read from the sender"`

### Task 12: The migration

**Files:**
- Create: `supabase/migrations/20261017130000_read_receipts.sql`

**Interfaces:**
- Produces: `public.dm_read_state`; `mark_messages_read(p_conversation_id uuid)` (same signature as today); `get_my_read_marker(p_conversation_id uuid) returns timestamptz` (what Task 10 calls); `get_dm_conversations` with the unread count read from the marker.

- [ ] **Step 1: Create the migration**

```sql
-- Read receipts that keep their promise. See docs/superpowers/specs/2026-10-16-presence-design.md, section 8.
--
-- Until now mark_messages_read always set direct_messages.read_at, which the sender can read, so the
-- "Read receipts" toggle protected nothing, and read_at was also what unread counts were built on.
-- This separates the two:
--   dm_read_state.last_read_at   private, per member and conversation: drives unread counts and badges
--   direct_messages.read_at      the receipt the sender sees: only set when the READER has receipts on
-- Unread keeps its old meaning (messages from others newer than the marker, and not followed by a
-- reply of mine), so counts do not change for anyone on the day this ships.

create table if not exists public.dm_read_state (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null,
  primary key (conversation_id, user_id)
);
alter table public.dm_read_state enable row level security;   -- no policies: reached only through the functions below
revoke all on public.dm_read_state from anon, authenticated;

-- Backfill so nothing flips on deploy: each member's marker is the latest read_at among messages from
-- others (or the conversation's creation time when they have read nothing), which reproduces the old
-- "read_at is null" count exactly because mark_messages_read always marked everything at once.
insert into public.dm_read_state (conversation_id, user_id, last_read_at)
select m.conversation_id, m.user_id,
       coalesce((select max(dm.read_at) from public.direct_messages dm
                  where dm.conversation_id = m.conversation_id and dm.sender_id <> m.user_id and dm.read_at is not null),
                dc.created_at)
  from (
    select c.id as conversation_id, c.user_a as user_id from public.dm_conversations c where coalesce(c.is_group, false) = false and c.user_a is not null
    union
    select c.id, c.user_b from public.dm_conversations c where coalesce(c.is_group, false) = false and c.user_b is not null
    union
    select gm.conversation_id, gm.user_id from public.dm_conversation_members gm
  ) m
  join public.dm_conversations dc on dc.id = m.conversation_id
on conflict (conversation_id, user_id) do nothing;

create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  receipts boolean;
  previous timestamptz;
begin
  if me is null or not public.is_dm_conversation_member(p_conversation_id, me) then return; end if;

  select rs.last_read_at into previous
    from public.dm_read_state rs
   where rs.conversation_id = p_conversation_id and rs.user_id = me;

  insert into public.dm_read_state as rs (conversation_id, user_id, last_read_at)
  values (p_conversation_id, me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  select p.read_receipts into receipts from public.profiles p where p.id = me;
  if coalesce(receipts, true) then
    -- Only what was unread a moment ago. Messages read privately while receipts were off must not
    -- turn into receipts the day they are switched back on.
    update public.direct_messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and sender_id <> me
       and read_at is null
       and created_at > coalesce(previous, '-infinity'::timestamptz);
  end if;
end;
$$;
revoke all on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- The thread needs the marker to place its "New messages" divider without relying on read_at.
create or replace function public.get_my_read_marker(p_conversation_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select rs.last_read_at
    from public.dm_read_state rs
   where rs.conversation_id = p_conversation_id
     and rs.user_id = auth.uid();
$$;
revoke all on function public.get_my_read_marker(uuid) from public, anon;
grant execute on function public.get_my_read_marker(uuid) to authenticated;

create or replace function public.get_dm_conversations(p_user_id uuid default auth.uid())
returns table(
  id uuid, other_user_id uuid, other_username text, other_display_name text,
  other_avatar_color text, other_last_seen_at timestamp with time zone, is_group boolean,
  group_title text, group_avatar_color text, member_count bigint,
  last_message_at timestamp with time zone, last_message_text text, last_message_kind text,
  unread_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with caller as (
    select case
      when coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
        then coalesce(p_user_id, auth.uid())
      else auth.uid()
    end as uid
  ),
  visible_conversations as (
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_a = caller.uid
    union all
    select dc.*
      from public.dm_conversations dc, caller
     where caller.uid is not null
       and coalesce(dc.is_group, false) = false
       and dc.user_b = caller.uid
    union all
    select dc.*
      from public.dm_conversation_members m
      join public.dm_conversations dc on dc.id = m.conversation_id, caller
     where caller.uid is not null
       and m.user_id = caller.uid
       and coalesce(dc.is_group, false) = true
  )
  select
    dc.id,
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end as other_user_id,
    p.username as other_username,
    p.display_name as other_display_name,
    p.avatar_color as other_avatar_color,
    p.last_seen_at as other_last_seen_at,
    dc.is_group,
    dc.title as group_title,
    coalesce(dc.avatar_color, '#6366F1') as group_avatar_color,
    case
      when dc.is_group then (
        select count(*) from public.dm_conversation_members m where m.conversation_id = dc.id
      )
      else 2
    end as member_count,
    dc.last_message_at,
    dc.last_message_text,
    dc.last_message_kind,
    (
      select count(*)
        from public.direct_messages dm
       where dm.conversation_id = dc.id
         and dm.sender_id != caller.uid
         and dm.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
         and dm.deleted_at is null
         and not exists (
           select 1
             from public.direct_messages dm2
            where dm2.conversation_id = dc.id
              and dm2.sender_id = caller.uid
              and dm2.created_at >= dm.created_at
         )
    ) as unread_count
  from visible_conversations dc
  cross join caller
  left join public.dm_read_state rs on rs.conversation_id = dc.id and rs.user_id = caller.uid
  left join public.profiles p on p.id = (
    case
      when dc.is_group then null
      when dc.user_a = caller.uid then dc.user_b
      else dc.user_a
    end
  )
  order by dc.last_message_at desc nulls last;
$function$;
```

- [ ] **Step 2: Apply locally and run the suite**

```bash
PGPASSWORD=postgres psql postgresql://postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261017130000_read_receipts.sql
node scripts/probe-flows.mjs 2>&1 | grep -E "❌|passed"
```
Expected: no `❌`, `87 passed, 0 failed`.

- [ ] **Step 3: Commit** `git add supabase/migrations/20261017130000_read_receipts.sql && git commit -m "Read receipts keep their promise: private read marker, receipts only for the reader who opted in"`

### Task 13: Prove the counts do not change, then ship

- [ ] **Step 1: Validate against the live schema, including that every existing unread count is unchanged**

```bash
{ echo "begin;"; cat supabase/migrations/20261017130000_read_receipts.sql; cat <<'SQL'
do $$
declare pairs int; mismatches int; sample text;
begin
  with members as (
    select c.id cid, c.user_a uid from public.dm_conversations c where not coalesce(c.is_group, false) and c.user_a is not null
    union select c.id, c.user_b from public.dm_conversations c where not coalesce(c.is_group, false) and c.user_b is not null
    union select m.conversation_id, m.user_id from public.dm_conversation_members m
  ),
  old as (
    select m.cid, m.uid, (select count(*) from public.direct_messages dm
        where dm.conversation_id = m.cid and dm.sender_id <> m.uid and dm.read_at is null and dm.deleted_at is null
          and not exists (select 1 from public.direct_messages d2 where d2.conversation_id = m.cid and d2.sender_id = m.uid and d2.created_at >= dm.created_at)) n
      from members m
  ),
  new as (
    select m.cid, m.uid, (select count(*) from public.direct_messages dm
        left join public.dm_read_state rs on rs.conversation_id = m.cid and rs.user_id = m.uid
        where dm.conversation_id = m.cid and dm.sender_id <> m.uid and dm.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz) and dm.deleted_at is null
          and not exists (select 1 from public.direct_messages d2 where d2.conversation_id = m.cid and d2.sender_id = m.uid and d2.created_at >= dm.created_at)) n
      from members m
  )
  select count(*), count(*) filter (where o.n <> w.n), coalesce(string_agg(o.cid::text||':'||o.n||'->'||w.n, ', ') filter (where o.n <> w.n), 'none')
    into pairs, mismatches, sample
    from old o join new w using (cid, uid);
  raise exception 'RESULTS: % member/conversation pairs, % mismatched unread counts (%)', pairs, mismatches, sample;
end $$;
SQL
echo "rollback;"; } > /tmp/receipts_live.sql
supabase db query --linked -f /tmp/receipts_live.sql 2>&1 | grep -o "RESULTS:[^\\\\]*" | head -1
```
Expected: `RESULTS: <N> member/conversation pairs, 0 mismatched unread counts (none)`. **If any mismatch appears, stop and report it; do not ship.** Then confirm nothing persisted (`select count(*) from pg_class where relname='dm_read_state'` returns 0).

- [ ] **Step 2: Full checks, push, open the draft PR** (same as Task 3 Step 3); the body states the ship order, the equivalence result, and **Unverified**: after merge confirm `dm_read_state` exists, the inbox unread badges are unchanged for the owner's account, and with Read receipts off a sent message never gets a tick on the sender's side.

- [ ] **Step 3: On "merge N"**, merge, poll prod for `dm_read_state`, run `supabase db push --dry-run`, and check the owner's inbox badges against what they were before.

---

## Appendix: shipping an OTA (all three runtimes)

This is the procedure used for every JS change in this repo. Run it after a merge to `main`.

```bash
git checkout main && git pull --ff-only
npx eas-cli update --branch production --environment production --message "<what changed> (#N)" --non-interactive
```
That publishes iOS (`e0c9344ef1af`) and Android (`df84f9ad571f`). Android installs still on the old runtime (`1610ad685900`) need the same change on `ota/android-pre-native`: in a scratch copy of the repo, check out that branch, cherry-pick **every merge commit that changed app JavaScript since the last time that branch was updated** with `git cherry-pick -m 1 <merge-sha>` (merges that only touch migrations, scripts, docs or edge functions can be skipped), then run `npx eas-cli update --branch production --environment production --platform android --message "<...>, old runtime" --non-interactive`. The runtime printed in the output must be `1610ad685900`; if a cherry-pick conflicts, stop and resolve it by hand.

---

## Self-Review

**Spec coverage.** 4.1 table → Task 2. 4.2 `ping_presence` → Task 2 (probes: guard, opt-out delete). 4.3 `get_presence` → Task 2 (probes: mutual, one-way, stranger, blocked, opted-out, ghost ids, reciprocity, buckets and edges, cap, anon, table unreadable). Section 5 client: heartbeat and `usePresence` → Tasks 4, 5; `isUserOnline` unchanged → Task 5; phrases and DM/profile headers → Task 6; channel deleted → Task 5 (rewrite) + guard in Task 7; settings → Task 7; API layer → Tasks 5 and 7. Section 6 rollout: `last_seen_at` untouched → Global Constraints, Task 2 probe "never written", Task 7 Step 3; public channel owner step → Task 8 Step 4; order → Ship order. Section 7 privacy: indistinguishable rows and no timestamps → Task 2 probes. Section 8 read receipts: marker table, backfill, `mark_messages_read`, unread paths → Task 12; thread dependency on `read_at` (found while planning) → Tasks 9, 10; ordering trap → Ship order and PR 3a/3b. Section 9 testing → probes `[14]`, `[16]`, core tests, guard tests, device check in Task 8. Section 10 phases → the three series.

**Placeholder scan.** No TBD, TODO or "similar to". PR bodies are described by required contents because they are prose written at PR time from the results; the code, SQL, probes, commands and expected outputs are all given.

**Consistency.** `get_presence(p_user_ids uuid[])` and `ping_presence()` (Task 2) match `fetchPresence` and `pingPresence` (Task 5). `PresenceRow` fields (`user_id`, `online`, `last_active`) match the SQL `returns table`. Store field `byUser` is used in `theme.ts`, the thread, the profile and the tests. `get_my_read_marker(p_conversation_id)` (Task 12) matches `fetchMyReadMarker` (Task 10). Migration timestamps `20261017120000` and `20261017130000` follow the latest existing `20261016130000`.

**Two things worth saying out loud.** The probes caught a real flaw in the spec's read-receipts rule while this plan was being written (the sweep must only cover messages unread at that moment); the spec section 8 and the SQL in Task 12 already include the fix. And every SQL block, probe block and the client core in this plan was run before being written here (probes: 87 of 87 on the local stack; client core: 12 of 12), and both production-validation harnesses were run locally against real data (a mutual-follow pair; a conversation with read, unread and replied messages: 2 pairs, 0 mismatched unread counts). The first draft of the presence harness called a function `anon` cannot execute, which crashes the local Postgres backend, so it now asks the catalog instead; that rule is in the harness comment.
