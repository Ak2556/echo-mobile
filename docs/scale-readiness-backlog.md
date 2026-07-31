# Echo Scale-Readiness Backlog

**Goal (as stated):** handle ~10,000 concurrent and ~10M total users with a
top-notch, low-error experience; usable by any skill level; and drive daily
return through mini-apps.

**Status of this doc:** a ranked map only — no code has changed. Effort and
priority are estimates to help sequence the work.

> **Reality checks baked into this plan**
> 1. *"Never any error"* is not literally reachable (networks drop, providers
>    throttle, phones go offline). The target is **graceful degradation**: every
>    failure has retry/fallback/honest-message and no user data is lost. Echo's
>    bones for this are already strong.
> 2. *"1 hour/day"* is reframed to **daily return + genuine value** (your
>    north-star memory already says this). Optimizing raw minutes is a
>    dark-pattern trap that hurts trust and App Store standing. Every engagement
>    item below is measured by *return rate / task completion*, not time-on-app.
> 3. Several engagement items **require lifting the 2026-07-27 feature freeze**.
>    They're tagged 🚫. Scale/reliability/ease-of-use items fit inside the freeze
>    (✅).

**Legend** — Effort: `S` <1d · `M` 1–3d · `L` 1–2wk · `XL` multi-week.
Freeze: ✅ compatible · 🚫 needs freeze lift.

---

## Where Echo actually stands (baseline — mostly good)

Verified in the codebase today:

- **Reliability engineering is above launch-stage average.** Global
  `AppErrorBoundary`, a `MutationCache` with friendly errors + opt-out meta,
  deliberate *no-auto-retry on non-idempotent writes* + offline outbox for
  durable replay, SSE→fetch fallback and 401-refresh-retry on the AI stream
  (`lib/api.ts`, `app/_layout.tsx`).
- **AI abuse/cost is already governed.** `_shared/rateLimit.ts` = per-user
  hourly limiter with plan tiers (free 30 → founder 600/hr), **fails closed**.
- **DB indexing is decent.** 30/89 migrations add indexes; hot tables
  (`public_echoes`, `echo_comments`, `echo_likes`, `follows`, `direct_messages`)
  are covered.
- **Feeds paginate** (`useFeed.ts`, `useInfiniteQuery`, PAGE_SIZE 20).
- **Telemetry** (Sentry + consent-gated PostHog), a **backend drift audit**
  (`scripts/audit-backend.mjs`), and a **go-live checklist** all exist.
- **Onboarding already redesigned** value-first (target funnel retired;
  `app/onboarding.tsx`, `/welcome`).

So this is a **hardening-and-gaps** effort, not a rebuild.

---

## Top 10 — do in this order

| # | Item | Thrust | Effort | Freeze |
|---|------|--------|--------|--------|
| 1 | Load test the real stack (find the ceiling before users do) | Scale | M | ✅ |
| 2 | Fix unfiltered global realtime fan-out on `public_echoes` | Scale | M | ✅ |
| 3 | Bound the global presence topic | Scale | M | ✅ |
| 4 | Verify Supavisor pooling + set Postgres/PgBouncer limits | Scale | S | ✅ |
| 5 | Index audit against real query plans (`EXPLAIN ANALYZE`) | Scale | M | ✅ |
| 6 | Network-status banner + offline outbox coverage audit | Reliability | M | ✅ |
| 7 | Empty/error/loading-state coverage sweep | Reliability | M | ✅ |
| 8 | Accessibility pass (labels, contrast, tap targets) | Ease-of-use | L | ✅ |
| 9 | First-run → mini-app guidance | Ease-of-use | M | ✅ |
| 10 | Mini-app discovery + "make default" (engagement) | Engagement | L | 🚫 |

---

## Thrust 1 — Scale (10K concurrent / 10M total)

Mostly **infra + DB**, not app code. This is where the biggest unknowns live.

### P0

- **[M ✅] Load test the real stack.** There is *zero* load-test evidence in the
  repo (only Maestro e2e smoke yaml in `e2e/`). Build a k6/artillery harness
  hitting the real hot paths: feed read, post write, `echo-ai` stream, DM
  send/read, realtime subscribe. Ramp to 10K virtual users against a staging
  Supabase project. **Everything below is a hypothesis until this runs** — it
  tells you the actual ceiling and which fix matters.
- **[M ✅] Unfiltered global realtime fan-out.** `useRealtimeNewEchoes`
  (`lib/realtime.ts`) subscribes *every* online client to *all* INSERTs on
  `public_echoes` with no filter. At 10K concurrent + active posting this is
  N×M message fan-out — a likely first bottleneck. Fix: throttle/batch, gate to
  a "new posts" pill, or move to a periodic count query instead of live stream.
- **[M ✅] Global presence topic.** `lib/presence.ts` puts every signed-in
  client in one shared presence topic; presence state is broadcast to all. At
  10K concurrent the payload grows O(online). Fix: scope presence to
  conversations/followed set, cap, or sample.
- **[S ✅] Connection pooling.** Confirm the client uses the **Supavisor
  transaction pooler** (port 6543), not a direct DB connection, and set sane
  Postgres `max_connections` / pool sizes. 10M users on unpooled connections
  exhausts Postgres fast. (Verify in Supabase dashboard — can't confirm from the
  repo.)

### P1

- **[M ✅] Index audit against real plans.** Coverage is decent but unverified
  under load. Run `EXPLAIN ANALYZE` on the top 10 queries (feed, notifications,
  DM inbox, search, profile) at 10M-row scale; add composite/partial indexes
  where seq scans appear. Watch `echo_views`, `daily_answers`, `follows`
  fan-out.
- **[M ✅] Edge-function ceilings.** `echo-ai` (1509 lines) has per-user rate
  limits but no global concurrency/cost ceiling; **OpenRouter provider limits**
  are an external cap. Add a global circuit-breaker + graceful "AI busy" state,
  and confirm function concurrency limits on the Supabase plan.
- **[S ✅] Storage/CDN for media.** Confirm image/audio uploads go through a CDN
  and are size-capped + transformed (avatars, camera/voice-memo mini-apps).
- **[M ✅] Cost model.** At 10M users, AI + embeddings + realtime + egress
  dominate cost. Model per-DAU cost and set alerting; the free-tier 30 req/hr
  limiter helps but egress/realtime don't have a ceiling yet.

### P2

- **[S ✅] Supabase plan sizing** (compute add-on, read replicas for feed reads).
- **[M ✅] Rate-limit the non-AI write paths** (posts, comments, DMs, reports)
  to blunt spam/abuse at scale.

---

## Thrust 2 — Reliability (zero-error *experience*)

Bones are strong; this is closing holes.

### P1

- **[M ✅] Network-status banner + reconnect UX.** Global offline/online
  indicator so failures read as "you're offline," not "the app is broken."
  React Query already has `refetchOnReconnect`; surface it.
- **[M ✅] Offline outbox coverage audit.** Verify *every* non-idempotent write
  (post, comment, DM, reaction, report, mini-app sync) routes through the
  durable outbox — not just some. Document which do.
- **[M ✅] Empty/error/loading state sweep.** Confirm every screen (24 mini-apps
  + social surfaces) has all three states. Missing states are the #1 source of
  "looks broken" moments for non-technical users.

### P2

- **[S ✅] Sentry release-health + alerting** on crash-free rate, ANRs, and the
  retention funnel (`app_open`, `signup_completed`, `daily_answer_submitted`).
- **[M ✅] Chaos pass:** kill the network mid-AI-stream, mid-DM-send,
  mid-publish; confirm no dupes, no data loss, honest recovery.
- **[S ✅] Schema-drift guard in CI.** You already have `audit-backend.mjs` and a
  documented recurring drift bug — gate CI on it if not already.

---

## Thrust 3 — Ease-of-use (any skill level)

Largely freeze-compatible polish.

### P1

- **[L ✅] Accessibility pass.** Tap targets ≥44pt, `accessibilityLabel`/`role`
  on every interactive element, contrast (WCAG AA), VoiceOver/TalkBack, dynamic
  type. You have the `chrome-devtools-mcp:a11y-debugging` skill and
  `docs/testing/accessibility.md` — run it systematically. This is *the* lever
  for "in-depth to barely-technical" reach.
- **[M ✅] First-run → mini-app guidance.** Onboarding is value-first but doesn't
  yet route new users into a mini-app win. A single "try this in 30s" moment
  (pick calculator/notes/habits) creates the first success.

### P2

- **[M ✅] Copy/clarity pass** on error toasts, empty states, and settings — plain
  language, no jargon.
- **[S ✅] Localization coverage.** `lib/i18n.ts` is large (66k) — confirm the
  top surfaces are fully translated for the launch locales.
- **[M ✅] Undo everywhere** (delete post/message/mini-app entry) — forgiving UX
  is what non-technical users need most.

---

## Thrust 4 — Engagement (mini-app preference + daily return)

**All 🚫 — needs the feature freeze lifted.** Reframed to daily return + task
completion, not raw minutes.

### If freeze lifts

- **[L 🚫] Mini-app discovery + "make default."** A home surface that surfaces
  the right mini-app in context, plus a "use Echo's X instead" prompt (share
  sheet / deep link interception where the OS allows). This is the core of
  "prefer our mini-apps over the default app."
- **[M 🚫] Streaks & momentum** already partially exist (`lib/dailyStreak.ts`,
  daily-question cron) — extend to mini-apps (habit/fitness/expenses streaks)
  with honest, non-manipulative nudges.
- **[M 🚫] Personalized nudges** via existing `personalized-fanout` /
  `push-fanout` — "your workout is usually now," "3 expenses to log." Consent-
  gated (you already have the consent migration).
- **[M 🚫] Cross-mini-app home widget / floating agent** — you have
  `FloatingMiniApp` + `FloatingEchoAgent`; make them the fast path back in.

> Recommendation: keep the freeze until the P0/P1 scale + reliability + a11y work
> lands. Ship stable first; a fast, reliable, accessible app *is* the strongest
> retention driver. Turn on engagement features post-launch with real funnel
> data.

---

## What I could not verify from the repo (needs dashboard/live access)

- Supavisor pooling mode + Postgres connection limits.
- Actual query plans at scale (need a populated staging DB).
- Supabase plan tier / compute add-on / read replicas.
- OpenRouter account concurrency + spend limits.
- CDN configuration for Storage.

These are the first things to confirm before load testing.

---

## Suggested sequencing

1. **Week 1:** Load-test harness (#1) + verify pooling (#4) → get the real
   ceiling. Fix realtime fan-out (#2) and presence (#3) since they're the most
   likely first walls.
2. **Week 2:** Index audit under load (#5), edge-function ceilings, network
   banner + outbox audit (#6), state sweep (#7).
3. **Week 3:** Accessibility pass (#8) + first-run mini-app guidance (#9).
4. **Post-launch:** lift freeze, ship engagement (#10) with funnel data.
