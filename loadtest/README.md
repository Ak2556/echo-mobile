# Echo Load-Test Harness (k6)

Answers the #1 question in `docs/scale-readiness-backlog.md`: **what is Echo's
real ceiling, and which fix actually matters** before 10K concurrent / 10M total
users. Exercises the true hot paths — feed reads, post writes, likes, the
`echo-ai` stream, and realtime fan-out — against a running Supabase project.

---

## ⚠️ Read this first — do NOT point this at production

The app's production Supabase project is `eyokhisijabitzjiydmz`. Load-testing it
would pollute real data, burn AI/egress cost, trip rate limits, and risk an
outage for real users. **Every script here refuses to run against that project
ref** unless you set `LOADTEST_ALLOW_PROD=yes-i-own-the-blast-radius` (don't).

**Correct setup:** spin up a *separate, throwaway* Supabase project, run
`supabase db push --linked` against it so the schema matches, seed some content
(`scripts/seed-content.js`), and point the harness there.

Writes are tagged `[loadtest]` and every test user is deleted by the teardown
script — but that safety net only exists on the staging project you own.

---

## Prerequisites

- **k6** — `brew install k6` (macOS). It's a standalone binary; not an npm dep.
- A **staging** Supabase project with the schema pushed.
- Its **URL**, **anon (publishable) key**, and **service-role key**.

## One command — the whole local suite

For a local Docker run, `loadtest:all` orchestrates everything end-to-end:
ensure stack up → provision → **smoke → capacity ramp → realtime fan-out** →
teardown. The AI path stays **off** (it calls the real provider and costs
tokens).

```bash
npm run loadtest:all                        # defaults: TARGET=1000, USERS=500
TARGET=2000 USERS=800 npm run loadtest:all  # bigger run
STOP_STACK=1 npm run loadtest:all           # also `supabase stop` at the end
```

Smoke gates the run (a smoke failure aborts before the ramp). A crossed
threshold in the capacity ramp is reported, not treated as a suite failure.
Everything below documents the individual steps `loadtest:all` runs for you.

## 1. Provision test users (once per run)

```bash
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
COUNT=500 node loadtest/scripts/provision-users.mjs
```

Writes `loadtest/.users.json` (gitignored). Without this, the harness runs
**read-only** with the anon key (still a valid feed-read capacity test).

## 2. Smoke test (always do this before scaling)

```bash
k6 run \
  -e LOADTEST_URL=https://<staging-ref>.supabase.co \
  -e LOADTEST_ANON_KEY=<anon-key> \
  loadtest/smoke.js
```

1 VU, one pass over every path. Confirms auth + request shapes are correct.
If a check fails here, fix it before ramping.

## 3. Capacity run — find the ceiling

```bash
k6 run \
  -e LOADTEST_URL=https://<staging-ref>.supabase.co \
  -e LOADTEST_ANON_KEY=<anon-key> \
  -e TARGET=2000 -e HOLD=3m \
  loadtest/main.js
```

Ramp `TARGET` up run over run (500 → 2000 → 5000 → 10000) and watch where the
thresholds break. Knobs (all env vars):

| Var | Default | Meaning |
|-----|---------|---------|
| `TARGET` | 50 | peak concurrent VUs |
| `RAMP` / `HOLD` / `RAMP_DOWN` | 30s / 1m / 15s | stage durations |
| `INCLUDE_WRITES` | on (`0` to disable) | create posts + likes |
| `INCLUDE_AI` | off (`1` to enable) | include `echo-ai` (costs tokens, rate limited) |
| `TOKEN_POOL` | 200 | distinct sessions signed in for the run |

**Pass/fail thresholds** (in `main.js`) encode the "top-notch experience" bar:
`http_req_failed < 1%`, feed latency `p95 < 800ms` / `p99 < 1.5s`, checks
`> 99%`. k6 exits non-zero when they break — the point where they break is your
ceiling.

## 4. Realtime fan-out (the flagged #2 risk)

```bash
k6 run \
  -e LOADTEST_URL=https://<staging-ref>.supabase.co \
  -e LOADTEST_ANON_KEY=<anon-key> \
  -e TARGET=1000 -e HOLD=3m \
  loadtest/realtime.js
```

Holds `TARGET` WebSocket subscribers open on the *unfiltered* `public_echoes`
INSERT stream (exactly like `useRealtimeNewEchoes`). Run it **at the same time**
as `main.js` (writes generate the broadcasts) to measure true fan-out cost.
Watch `realtime_broadcasts_received`, `realtime_connect_errors`, and the
project's realtime connection/message quota.

## 5. Tear down

```bash
SUPABASE_URL=https://<staging-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node loadtest/scripts/teardown-users.mjs
```

Deletes all `[loadtest]` echoes and every provisioned user.

---

## Layout

```
loadtest/
  config.js            env-driven config + prod safety guard
  smoke.js             1-VU sanity pass over every path
  main.js              weighted user-session capacity test (the ceiling finder)
  realtime.js          WebSocket fan-out test (concern #2)
  lib/
    http.js            header builders (apikey + Bearer, mirrors the app)
    auth.js            token pool (sign in provisioned users)
    actions.js         the hot-path calls, with checks + latency metrics
  scripts/
    provision-users.mjs  create N test users -> .users.json
    teardown-users.mjs   delete tagged rows + test users
```

## Notes / honest limitations

- **VUs vs. machines.** ~10K VUs from one laptop is often network/CPU-bound.
  Use a beefy CI box, or k6 Cloud / distributed mode, to reach 10K faithfully.
  Watch `http_req_blocked` / connection errors — if they climb, the *load
  generator* saturated, not Echo.
- **Realtime protocol** is Phoenix/Supabase-Realtime versioned; if joins fail,
  capture a frame from the browser devtools against your Realtime version and
  adjust the `phx_join` payload in `realtime.js`.
- **DM send/inbox is intentionally not in the automated mix** — it needs a
  conversation fixture and its read shape confirmed. Add it once staging has
  seeded conversations.
- Reading the full `echo-ai` SSE body (no token-by-token streaming) still
  measures end-to-end latency and concurrency survival, which is what capacity
  planning needs.
```
