<div align="center">
  <h1>Echo</h1>
  <p><b>A voice-first social network with an AI that listens, acts and translates.</b></p>
  <p>Built for India · 26 languages · iOS, Android, web and desktop from one codebase</p>
  <p><i>Pre-launch. Not yet in the app stores.</i></p>
</div>

---

## What Echo is

A consumer social network where speaking is the primary input, the AI can act on the app rather than just describe it, and a set of everyday tools gives you a reason to open it on a day you have nothing to post.

Three things make it different from a generic social app:

- **Voice-first, not voice-added.** One recording becomes a transcript, a structured intent and a spoken reply in a single model call, so the app can act on what you said.
- **The interface itself is localised**, not just the content. Greeting, tabs, prompts and layout direction all follow the reader — including right-to-left.
- **The Daily Question** — one question a day, the same for everyone, that closes. A ritual instead of an infinite scroll.

---

## Status

Echo is **feature-complete for v1 and in polish** ahead of store submission. It has **no users yet**. Nothing in this README should be read as traction.

| | |
|---|---|
| Screens | 87 |
| Database tables | 66 (RLS on 58) |
| Edge functions | 19 |
| Migrations | 122 |
| Mini-apps | 22 |
| Languages | 26 — 13 Indian, 13 global |
| First-party TypeScript | ~91,000 lines |
| Tests | 241, via Vitest |

Counts are generated from the tree, not maintained by hand. Re-derive them before quoting them anywhere.

---

## Architecture

```
iOS · Android · Web · Electron desktop
                │
   React Native 0.81 · Expo SDK 54 · expo-router
   TanStack Query · Zustand · MMKV
                │
   ┌────────────┴────────────┐
   │                         │
Cloudflare Worker        Supabase
(Hono, aws4fetch)        · Postgres + RLS
· signed R2 uploads      · Auth (email/phone OTP, Google)
· DM media access        · Realtime
                         · 19 Deno edge functions
   │                         │
Cloudflare R2            Google Gemini 2.5
5 media buckets          via OpenRouter
```

**Where the data lives:** Postgres and auth in Supabase `ap-northeast-1` (Tokyo). All uploaded media in Cloudflare R2. AI, crash reporting and analytics in the United States. This matters for the privacy policy and for cross-border rules — see `constants/legal/privacyPolicy.ts`.

---

## Stack

| Layer | Choice |
|---|---|
| Client | React Native 0.81, Expo SDK 54, expo-router |
| Server state | TanStack Query |
| Client state | Zustand |
| Local storage | MMKV |
| Backend | Supabase — Postgres, Auth, Realtime, Deno edge functions |
| Object storage | Cloudflare R2, fronted by a Hono Worker |
| AI | Google Gemini 2.5 (flash / flash-lite / pro) via OpenRouter |
| Payments | Apple / Google IAP, RevenueCat entitlements, Razorpay for ad orders |
| Observability | Sentry, PostHog (consent-gated) |
| Tests | Vitest; Maestro for end-to-end flows |

---

## Quick start

```bash
npm ci
cp .env.example .env      # fill in Supabase URL + anon key
npm start                 # then i / a / w
```

Without Supabase credentials the app runs against offline mock data.

```bash
npm run typecheck
npm run lint
npm test
npm run legal:sbom        # regenerate NOTICE and sbom.json
```

---

## Repository layout

```
app/                 expo-router screens (file-based routing)
components/          shared UI
src/features/        feature modules (feed, chat, auth, voice)
src/shared/          theme, database, i18n, platform helpers
lib/                 API wrappers, domain logic, mini-app data
constants/legal/     Terms, Privacy Policy, entity facts, age policy
supabase/            migrations and edge functions
cloudflare/          the R2 worker
scripts/             i18n, SBOM and legal-translation generators
```

---

## Things you should know before contributing

These are real, current, and would otherwise cost you an afternoon.

- **`android/` and `ios/` are generated.** They are prebuild output and gitignored. Change `app.json`, never the native projects.
- **Echo does not have end-to-end encrypted messaging.** `src/shared/lib/e2ee.ts` implements a keypair, but nothing calls it — `syncDatabase()` is dead code and the live DM path writes plaintext. Both files carry banners saying so. Do not describe Echo as end-to-end encrypted.
- **The feed is ranked**, not chronological. There is a ranked feed, a semantic feed, per-user taste vectors and content embeddings. A chronological "Latest" tab exists as the alternative.
- **Deletion goes through the `delete-account` edge function**, not the `delete_account()` RPC directly. The RPC only reaches Postgres; media lives in R2 and has to be purged separately, first.
- **The mini-app catalog is the source of truth** for what ships. "Passwords" was removed on 2026-08-22 because its vault was sample data, not a vault.
- **Unresolved legal facts are greppable.** `grep -rn "\[\[" constants/legal/` lists every placeholder that must be filled before launch.

---

## Legal and compliance

The Terms of Service and Privacy Policy are **drafts pending counsel review** and live in code so the app and any web mirror can never drift:

- `constants/legal/termsOfService.ts` — v3.0 draft
- `constants/legal/privacyPolicy.ts` — v3.0 draft
- `constants/legal/entity.ts` — every unresolved entity fact, as `[[PLACEHOLDER]]`
- `constants/legal/ageGate.ts` — age thresholds, mirrored in SQL
- `constants/legal/eighthSchedule.ts` — the 22 languages DPDP Act 2023 §5 requires notices to be available in

`NOTICE` and `sbom.json` record third-party attribution and licence elections.

---

## Licence

See `LICENSE`.

> **Note:** this repository is currently public under the MIT licence, with copyright attributed to an individual GitHub handle rather than an operating entity. That is under review and expected to change before launch.
