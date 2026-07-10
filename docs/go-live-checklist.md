# Echo Go-Live Checklist

The single source of truth for taking Echo from "runs locally" to "live on the
App Store." Work top to bottom. Anything marked **BLOCKER** must be resolved
before submission; **Caution** marks items that are easy to miss.

> Project facts: Supabase project `eyokhisijabitzjiydmz`, EAS
> project `a743cf66-7ec4-4ff0-ad2a-4088398b5654`, bundle id `com.ak2556.echo`.
> Migrations and functions go through the **Supabase CLI `--linked`**, never the
> MCP server (it points at a different project). See `memory` / deploy-workflow.

---

## 0. Pre-flight (local, free, do first)

- [ ] `npm ci`
- [ ] `npm run lint` — clean
- [ ] `npm run typecheck` — clean
- [ ] `npm test` — green (56 tests at time of writing)
- [ ] Smoke-test on the iOS simulator against a fresh Metro (`npx expo start`).

---

## 1. Backend: Supabase (do before the app build — the app depends on it)

### 1a. Push the database schema

```bash
supabase link --project-ref eyokhisijabitzjiydmz   # one-time
supabase db push --linked
supabase migration list --linked                   # Remote column should fill in
```

### 1b. Deploy every Edge Function

```bash
# user-facing (JWT-verified by default)
supabase functions deploy echo-ai
supabase functions deploy editorial-rewrite
supabase functions deploy embed-echo
supabase functions deploy embed-daily-answer
supabase functions deploy thinking-fingerprint
supabase functions deploy backfill-embeddings
supabase functions deploy push-fanout

# public / scheduler-triggered: use --no-verify-jwt
supabase functions deploy daily-question-push --no-verify-jwt
supabase functions deploy og-redirect --no-verify-jwt
```

### 1c. Set server-side function secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions automatically. Do not set them manually. Set only:

```bash
# REQUIRED: powers AI chat, content moderation, and all embeddings.
# The account is restricted to the google-ai-studio provider.
supabase secrets set OPENROUTER_API_KEY=<key>

# REQUIRED for the retention push loop (see section 1d).
supabase secrets set DAILY_PUSH_SECRET=<long-random-string>

# Optional: only if you host a web preview (see blockers in section 5).
supabase secrets set WEB_BASE_URL=https://<your-domain>
```

Optional model overrides (sane defaults exist in code — skip unless tuning):
`ECHO_AI_MODEL`, `MODERATION_MODEL`, `EDITORIAL_REWRITE_MODEL`,
`EMBEDDING_MODEL` (default `google/gemini-embedding-001`, 768-dim), `FINGERPRINT_MODEL`.

### 1d. Wire the daily-question push cron (retention loop)

The cron migration is already in `supabase/migrations/` and ran in §1a, but it
reads its secret from Vault, which you must populate **once**:

```sql
-- Supabase Dashboard → SQL Editor. Use the SAME string as DAILY_PUSH_SECRET above.
insert into vault.secrets (name, secret)
values ('daily_push_secret', '<same-long-random-string>');
```

- [ ] Verify: `select * from cron.job;` shows `daily-question-push` at `30 13 * * *` (19:00 IST).
- [ ] (Optional) Smoke-test now: `curl -X POST .../functions/v1/daily-question-push -H "x-cron-secret: <secret>"`.

### 1e. Seed the content pool (so a new install isn't empty)

```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node scripts/seed-content.js --embed
```

- [ ] Dry-run first (`--dry-run`, no creds needed) to sanity-check the dataset.
- [ ] After it runs, Discover/"Trending" is populated; `--embed` lights up the
      semantic "For You" feed. (Embeddings can also be generated via the
      `backfill-embeddings` function.)

---

## 2. App config sanity (`app.json`)

- [ ] Version `1.0.0`, `runtimeVersion.policy = appVersion`. Already set.
- [ ] `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`. Already set.
- [ ] Caution: **Microphone usage string.** The app records audio (voice-memo mini-app).
      Confirm the iOS build includes an `NSMicrophoneUsageDescription` (the
      `expo-audio` plugin injects a default; add an explicit one in
      `app.json -> ios.infoPlist` if App Review wants clearer wording).
- [ ] Caution: `ios.associatedDomains = ["applinks:echo.app"]` and the Android
      `echo.app` intent filter point at a domain you **don't own yet** (see
      blocker in section 5). Universal links won't verify until that's resolved. The app
      still works; only HTTPS-to-app deep links are affected. Custom `echo://`
      scheme links work regardless.

---

## 3. Client env → EAS Secrets (baked into the production build)

These are `EXPO_PUBLIC_*` vars read at build time. Set each as an EAS secret so
the production build picks them up (they end up in the JS bundle — only put
**publishable** keys here, never the service-role key):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL      --value https://eyokhisijabitzjiydmz.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-publishable-key>
eas secret:create --scope project --name EXPO_PUBLIC_API_URL           --value <api-url-if-used>
eas secret:create --scope project --name EXPO_PUBLIC_POSTHOG_KEY       --value <posthog-project-key>
eas secret:create --scope project --name EXPO_PUBLIC_POSTHOG_HOST      --value https://us.i.posthog.com
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN        --value <sentry-dsn>
eas secret:create --scope project --name SENTRY_ORG                    --value <sentry-org>
eas secret:create --scope project --name SENTRY_PROJECT                --value <sentry-project>
eas secret:create --scope project --name SENTRY_AUTH_TOKEN             --value <sentry-auth-token>
# Public launch domain + support contacts:
eas secret:create --scope project --name EXPO_PUBLIC_WEB_BASE_URL      --value https://<your-domain>
eas secret:create --scope project --name EXPO_PUBLIC_SUPPORT_EMAIL      --value support@<your-domain>
eas secret:create --scope project --name EXPO_PUBLIC_DSA_EMAIL          --value dsa@<your-domain>
# App Review demo account:
eas secret:create --scope project --name EXPO_PUBLIC_DEMO_EMAIL         --value reviewer-demo@<your-domain>
eas secret:create --scope project --name EXPO_PUBLIC_DEMO_PASSWORD      --value <demo-password>
```

- [ ] `eas secret:list` shows them all.
- [ ] Sentry sourcemap/debug-symbol upload succeeds in the production EAS build.
- [ ] Caution: Analytics is **consent-gated**. PostHog only initializes after the user
      accepts the in-app consent banner. No key means analytics silently no-ops
      (safe). Sentry/PostHog are optional to *ship* but expected for launch
      telemetry.

---

## 4. Build & submit (iOS)

Prereqs:
- [ ] BLOCKER: **Apple Developer Program** membership ($99/yr) active.
- [ ] App record created in **App Store Connect** for `com.ak2556.echo`.
- [ ] `eas login` done; `eas.json` `production` profile present.

Build, TestFlight, submit:

```bash
# 1. Production build (app-store credentials managed by EAS)
eas build --profile production --platform ios

# 2. Ship the build to App Store Connect / TestFlight
eas submit --profile production --platform ios --latest
```

- [ ] Test the exact production build via **TestFlight** on a real device before
      promoting to the App Store. OTA-update channel is `production`.
- [ ] Fill App Store metadata from `docs/app-store-listing.md` (name, subtitle,
      keywords, description, what's-new, category, age rating 17+).
- [ ] Upload screenshots (6.7" + 6.5" mandatory). Capture from the iPhone 17 Pro
      Max simulator **after seeding** so the feed looks alive.
- [ ] Privacy nutrition labels: copy from `app-store-listing.md -> Privacy
      nutrition label`. Remember to declare **Audio Data** (microphone).
- [ ] BLOCKER: **Privacy Policy URL** + **Support URL** must be live (see section 5).
- [ ] Caution: **Reviewer access.** Echo is passwordless for normal users, but
      the review build can expose an "App Review · Open demo account" button
      when `EXPO_PUBLIC_DEMO_EMAIL` + `EXPO_PUBLIC_DEMO_PASSWORD` are set.
      Create that no-real-data Supabase password user before the production
      build and put the same details in App Review notes. Without this, review
      can get stuck at the login screen.

---

## 5. Blockers to resolve before submission

### Domain ownership (`echo.app` is referenced but not owned)
This one domain gates four things:
1. **Privacy Policy URL** — *hard App Store requirement.*
2. **Support URL** — *hard App Store requirement.*
3. Universal links (`associatedDomains`, Android intent filter, AASA file).
4. The growth-loop web preview (`EXPO_PUBLIC_WEB_BASE_URL` / `WEB_BASE_URL`).

**Cheapest unblock:** you do **not** need `echo.app`. Pick any approach:
- Buy a domain you can get (`echoapp.io`, etc.), point the three env vars + the
  two `app.json` domains at it, drop `docs/apple-app-site-association.json` at
  `/.well-known/apple-app-site-association`, host `privacy-policy.md` and a
  one-line support page on it.
- Or, to ship *today*: host the privacy + support pages on a free static host
  (GitHub Pages, Notion public page, Vercel) and use those URLs in App Store
  Connect. Universal links + web preview stay disabled until you own a domain;
  the app is fully functional without them (`echo://` deep links still work).

### Legal ownership in `privacy-policy.md` / `terms-of-service.md`
- [ ] Confirm the store-listed seller/operator identity is correct for the
      production Apple Developer and Google Play accounts.
- [ ] Confirm `support@echo.app` is a mailbox you can actually receive at (or
      swap for one you control).

---

## 6. Post-launch watch (first 48h)

- [ ] PostHog: `app_open`, `signup_completed`, `daily_answer_submitted`,
      `remix_started` firing (the retention-thesis funnel).
- [ ] Sentry: no crash spike on cold start.
- [ ] Supabase logs: `echo-ai`, `embed-echo` healthy; moderation gate flipping
      `check_content`.
- [ ] Confirm the 19:00 IST daily push actually fanned out (`cron.job_run_details`).

---

### Rollback levers
- **App:** EAS OTA: publish a previous update to the `production` channel.
- **DB:** migrations are forward-only; keep a Supabase point-in-time backup before §1a.
- **Function:** `supabase functions deploy <name>` re-deploys a known-good copy.
