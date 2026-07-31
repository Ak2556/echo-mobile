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

_Last updated: 2026-07-31._

---

## ✅ Resolved / verified this session

- [x] **Backend drift audit clean** `{eng}` — `npm run audit:backend` vs prod: AI
      model IDs, all 4 storage buckets, and every app enum↔check-constraint pass.
- [x] **Unlike `uuid = text` bug** `P0` `{eng}` — `cleanup_on_echo_unlike()` cast
      bug that broke every unlike + liked-echo delete. Fixed, **deployed to prod**,
      verified (migration `20260731120000`).
- [x] **Age rating is consistent** `{decision}` — 16+ = minimum age (legal),
      17+ = App Store maturity rating (content). Not a conflict; docs reconcile it.
- [x] **Load-test harness exists + validated locally** `{eng}` — `loadtest/`;
      reads clean, write rate-limits confirmed, realtime fan-out observable.

---

## A. Infrastructure unknowns `{dashboard}` — determine ceiling & cost

- [ ] `P0` **Supabase plan + compute tier** — free/Pro? compute add-on? read
      replicas for feed reads? This *is* the capacity ceiling.
- [ ] `P0` **Connection pooling** — confirm client uses the **Supavisor
      transaction pooler (6543)**, not direct connections. Unpooled = Postgres
      connection exhaustion at scale.
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
- [ ] `P0` **Prod secrets set** `{dashboard}` — `OPENROUTER_API_KEY` (AI/mod/embeddings),
      `DAILY_PUSH_SECRET`. Confirm present.
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
- [ ] `P0` **Realtime fan-out fix** (backlog #2) — unfiltered `public_echoes`
      subscription; quantify + bound after the cloud load test.
- [ ] `P1` **Index audit under load**, **network-status banner + offline outbox
      coverage**, **empty/error/loading sweep**, **accessibility pass**.

---

## The three with real teeth

1. **D — retention cron** may be silently dead (only you can safely check).
2. **B — domain ownership** hard-blocks two App Store requirements.
3. **A — pooling + plan tier** decide whether "10k concurrent" is even reachable.
