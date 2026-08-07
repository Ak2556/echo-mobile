# Pre-Launch Gaps — Decisions & Verifications

The single tracker for **open questions** standing between Echo and a confident
production launch at scale. Unlike the other two docs, this one is about things
that need a **human decision** or **dashboard/account check** — not code.

- Mechanical ship steps → `docs/go-live-checklist.md`
- Engineering / scale work → `docs/scale-readiness-backlog.md`
- **This doc** → the gaps to *clarify* before those two can be finished.

**Status:** `[x]` done/verified · `[ ]` open · `[~]` in progress.
**Owner tags:** `{decision}` needs a founder call · `{dashboard}` needs
Supabase/OpenRouter/Apple console access · `{eng}` engineering task ·
`{external}` third-party/legal. **Priority:** `P0` launch-blocking · `P1`
launch-week · `P2` fast-follow.

_Last updated: 2026-08-07._

---

## ✅ Resolved / verified this session

- [x] **Backend drift re-verified (2026-08-07)** `{eng}` — `npm run audit:backend`
      green: AI model IDs, all 4 storage buckets, all enum↔check-constraint pairs.
- [x] **Connection pooling — N/A client-side** `P0` `{eng}` — no direct Postgres
      connections anywhere (`postgres://`/`:5432`/`pg.Pool` = 0 hits); the app and
      edge functions are 100% supabase-js/PostgREST over HTTPS, so client-side
      connection exhaustion is not a risk. (Server pool sizing still a dashboard note.)
- [x] **Prod AI + push secrets present** `{dashboard}` — `OPENROUTER_API_KEY`,
      `GEMINI_API_KEY`, and `DAILY_PUSH_SECRET` all set in Supabase secrets.
- [x] **Voice AI live on Google Gemini direct** `{eng}` — voice-command now calls
      Google AI Studio directly (free tier accepts audio); `GEMINI_VOICE_MODEL=
      gemini-flash-latest`. NOTE: still a FREE tier → the ~daily-quota cap in A-P0
      applies (heavy testing exhausts it; enable Google billing to lift).

- [x] **Backend drift audit clean** `{eng}` — `npm run audit:backend` vs prod: AI
      model IDs, all 4 storage buckets, and every app enum↔check-constraint pass.
- [x] **Unlike `uuid = text` bug** `P0` `{eng}` — `cleanup_on_echo_unlike()` cast
      bug that broke every unlike + liked-echo delete. Fixed, **deployed to prod**,
      verified (migration `20260731120000`).
- [x] **Age rating is consistent** `{decision}` — 16+ = minimum age (legal),
      17+ = App Store maturity rating (content). Not a conflict; docs reconcile it.
- [x] **Load-test harness exists + validated locally** `{eng}` — `loadtest/`;
      reads clean, write rate-limits confirmed, realtime fan-out observable.
- [x] **Credit/duplication hygiene pass (2026-08-03)** `{eng}` — embed-echo no
      longer double-fires per post (server trigger + a UX-safe 10s client
      fallback, ~½ the per-post moderation AI); `resweep` cron 5m→30m (288→48
      idle runs/day); `i18n-translate` re-secured (no open AI endpoint). Verified
      no client polling; realtime is scoped (presence=Messages, live feed=Home).

---

## A. Infrastructure unknowns `{dashboard}` — determine ceiling & cost

- [ ] `P0` **AI account is free-tier — throttles ALL AI features** `{dashboard}` —
      discovered 2026-08-03: the shared `OPENROUTER_API_KEY` falls back to Google
      AI Studio's free quota (**~20 generate requests/day**) with ~no OpenRouter
      credits. A bulk run 429'd after ~20. Every AI feature shares this key —
      **echo-ai chat, voice-command, mini-app-coach, i18n runtime + static
      translation** — so the whole AI layer dies after ~20 requests/day across all
      users. **Fix: add paid OpenRouter credits** (or a paid Google key) before
      launch, then `npm run i18n:generate` fills all 25 languages statically. This
      is the real cap-limiter. See memory `ai_quota_blocker`.
- [ ] `P0` **Supabase plan + compute tier** — free/Pro? compute add-on? read
      replicas for feed reads? This *is* the capacity ceiling.
- [x] `P0` **Connection pooling** — VERIFIED N/A: no direct Postgres connections;
      all traffic is supabase-js/PostgREST over HTTPS (see resolved list above).
- [ ] `P0` **Point-in-time recovery / backups enabled** — the rollback plan
      assumes it. Verify before any further prod migration.
- [ ] `P1` **Realtime quota** — plan's concurrent-connection + message-rate
      limits. Caps the flagged fan-out risk (see backlog #2).
- [ ] `P1` **OpenRouter account limits** — provider concurrency, monthly spend
      cap, billing alerts on the restricted google-ai-studio key.
- [ ] `P2` **Storage CDN + upload size caps** — buckets exist; confirm
      CDN/transform + size limits (avatars, voice-memo, camera). Egress cost.

## B. Launch blockers `{decision}` / `{external}`

- [ ] `P0` **Domain ownership** (`echo.app` not owned) — blocks Privacy Policy
      URL + Support URL (*hard* App Store requirements), universal links, web
      preview. Decide: buy a domain vs. free static host for the legal pages.
- [ ] `P0` **Legal operator identity** — privacy/terms still have placeholder
      **entity / venue / EU-rep** values. Set real ones before submission.
- [ ] `P0` **Support + DSA mailboxes receivable** — `support@…`, `dsa@…`.
- [ ] `P0` **Apple Developer membership** + App Store Connect record for
      `com.ak2556.echo`.
- [ ] `P1` **Reviewer demo account** (`EXPO_PUBLIC_DEMO_*`) — without it, review
      can get stuck at the passwordless login screen.

## C. Compliance `{external}` / `{decision}`

- [ ] `P1` **DSA Article 20 appeals flow** — the known remaining compliance gap.
      Confirm whether it's in-scope for the launch region/scale.
- [ ] `P0` **Privacy nutrition labels + Audio Data declaration** (microphone) in
      App Store Connect.

## D. Operational readiness

- [ ] `P0` **Retention cron actually live** `{dashboard}` — **highest-teeth item.**
      Without the Vault `daily_push_secret` row, the daily-question push silently
      never fires. Verify in the SQL editor (reads only non-secret columns):
      ```sql
      select jobid, jobname, schedule, active from cron.job;               -- expect 30 13 * * *, active
      select jobid, status, start_time, end_time
        from cron.job_run_details order by start_time desc limit 5;         -- expect recent 'succeeded'
      ```
      _(Automated check blocked on purpose: cron `command` embeds the secret.)_
- [x] `P0` **Prod secrets set** `{dashboard}` — `OPENROUTER_API_KEY`, `GEMINI_API_KEY`,
      `DAILY_PUSH_SECRET` all confirmed present (2026-08-07). _Cron still needs the
      active-job + recent-run verification below._
- [ ] `P1` **Cron list cost review** `{dashboard}` — the retention crons were
      created via dashboard/SQL, not migrations, so they can't be enumerated in
      code (and `cron.job.command` embeds secrets, so automated reads are blocked).
      Eyeball the full list for any redundant or too-frequent job burning the plan:
      ```sql
      select jobid, jobname, schedule, active from cron.job order by jobname;
      ```
      Migration-defined crons are already lean (resweep 30m; see hygiene pass above).
- [ ] `P1` **Alerting rules** `{dashboard}` — Sentry crash-free-rate + error-spike;
      PostHog retention funnel (`app_open`, `signup_completed`,
      `daily_answer_submitted`).
- [ ] `P2` **On-call / incident path** `{decision}` — who responds, where.
- [ ] `P2` **Rollback rehearsed once** `{eng}` — OTA + migration levers exist on
      paper; test them once.

## E. Scale & reliability `{eng}` — see `scale-readiness-backlog.md`

Tracked in full there; the launch-gating subset:

- [ ] `P0` **Load test on cloud staging** — real ceiling (local run only proved
      the harness). Needs a prod-like staging project.
- [~] `P0` **Realtime fan-out fix** (backlog #2) — unfiltered `public_echoes`
      subscription. **Mitigated (2026-08-07):** `useRealtimeNewEchoes` now
      foreground-gates the subscription (dropped while backgrounded) and batches
      insert bursts into one count update — cuts fan-out to actively-watching
      users at zero UX cost. Full batch/poll rework still deferred until the
      cloud load test quantifies the real ceiling.
- [ ] `P1` **Index audit under load**, **network-status banner + offline outbox
      coverage**, **empty/error/loading sweep**, **accessibility pass**.

---

## The three with real teeth

1. **A — AI account is free-tier (~20 req/day)** kills every AI feature under any
   real traffic; needs paid credits. The single hardest cap-limiter.
2. **B — domain ownership** hard-blocks two App Store requirements.
3. **A — pooling + plan tier** decide whether "10k concurrent" is even reachable.
   (Plus **D — retention cron** may be silently dead — only you can safely check.)
