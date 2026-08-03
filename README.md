<div align="center">

# Echo

### Think out loud — with an AI partner, in your language, by voice.

[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20·%20Edge-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Platform](https://img.shields.io/badge/Platform-iOS%20·%20Android%20·%20Web-4630EB?logo=expo&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-All%20rights%20reserved-lightgrey)](#-license)

</div>

Echo is a **social + AI thinking app**. Chat privately with an AI partner, then publish what's worth keeping as a public **echo**. Answer one shared question a day and unlock how everyone else thinks about it. Go deeper with built-in mini-apps and community surfaces — and drive the whole thing **by voice, in 25 languages**.

---

## ✨ Highlights

- 🎙️ **Voice-first control (Hindi + English)** — speak to navigate, post, and search; a Gemini audio→intent pipeline turns a spoken command into an in-app action.
- 🌍 **25-language UI** — a hand-authored core plus on-demand AI translation for everything else, cached on device. **RTL-ready** (Arabic, Urdu).
- 🤖 **AI thinking partner** — streamed chat with tool use; turn any conversation into a public echo in a tap.
- 🗣️ **Daily Question ritual** — one shared prompt a day; answer first to reveal the community's takes (recent, from people you follow, and the most divergent).
- 🔎 **Semantic feed** — vector embeddings rank discovery by what you actually read, not just recency.
- 🧩 **Mini-apps** — habits, fitness, expenses, tasks, pomodoro, voice memo, world clock — with an AI coach grounded in your real numbers.
- 🛒 **Community surfaces** — marketplace, salons, office hours, and thinking-partner matching.
- 🛡️ **DSA-aligned moderation** — pre-publish content checks, statements of reasons, and an author appeals flow.
- 📈 **Retention engine** — streaks, personalized nudges, and push fan-out via scheduled jobs.

---

## 🏗️ Architecture

```mermaid
flowchart LR
  subgraph Client["📱 Expo client · iOS / Android / Web"]
    UI["Expo Router UI"]
    State["TanStack Query · Zustand"]
  end

  subgraph Supabase["🗄️ Supabase"]
    PG[("Postgres + RLS")]
    RT["Realtime"]
    ST["Storage"]
    EF["Edge Functions ×14"]
    CRON["pg_cron"]
  end

  AI["🤖 OpenRouter · Gemini"]
  Push["🔔 Expo Push"]

  UI --> State
  State -->|reads / writes| PG
  State <-->|live| RT
  State --> ST
  State --> EF
  EF --> AI
  EF --> PG
  CRON --> EF --> Push
```

- **Client** — a single Expo Router codebase for iOS, Android, and Web; server state in TanStack Query, app state in Zustand, styling via NativeWind, motion via Reanimated.
- **Supabase** — Postgres with row-level security, Realtime, Storage, `pg_cron`, and **14 Edge Functions** (`echo-ai`, `embed-echo`, `voice-command`, `i18n-translate`, `mini-app-coach`, moderation/embeddings/retention, and more).
- **AI** — all model access is server-side through OpenRouter (Gemini); no provider keys ever ship in the app bundle.
- A small **FastAPI** service (`backend/`) remains for optional/secondary local flows.

Deeper notes: [`docs/architecture/overview.md`](docs/architecture/overview.md).

---

## 🧱 Tech stack

`Expo SDK 54` · `React Native 0.81` · `expo-router` · `TypeScript (strict)` · `Zustand` · `TanStack Query` · `NativeWind` · `Reanimated 4` · `Supabase (Postgres · Realtime · Storage · Edge Functions)` · `Gemini via OpenRouter` · `Sentry` · `PostHog`

---

## 🚀 Quick start

```bash
npm ci
cp .env.example .env      # fill your EXPO_PUBLIC_* values
npm start
```

Run on a target:

```bash
npm run ios       # iOS simulator
npm run android   # Android emulator
npm run web       # browser
```

Full local setup (Supabase CLI, Edge Functions, the optional backend) → [`docs/setup/local-development.md`](docs/setup/local-development.md).

---

## 📚 Documentation

| Topic | Link |
| --- | --- |
| Local development & setup | [`docs/setup/local-development.md`](docs/setup/local-development.md) |
| Architecture overview | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Environment & secrets policy | [`docs/security/environment-and-secrets.md`](docs/security/environment-and-secrets.md) |
| Deployment (EAS · Supabase · CI) | [`docs/deployment/deployment-guide.md`](docs/deployment/deployment-guide.md) |
| Testing guide | [`docs/testing/testing-guide.md`](docs/testing/testing-guide.md) |
| Contributing & ownership | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Pre-launch tracker | [`docs/pre-launch-gaps.md`](docs/pre-launch-gaps.md) |

Before opening a PR: `npm run lint && npm run typecheck && npm test`.

---

## 🗺️ Status

**v1 — pre-launch.** Core app is feature-complete and on prod Supabase; remaining work is billing, store assets, and dashboard checks — tracked in [`docs/pre-launch-gaps.md`](docs/pre-launch-gaps.md), with submission notes in [`docs/app-store-listing.md`](docs/app-store-listing.md).

---

## 📄 License

All rights reserved. Maintained by [`Ak2556`](https://github.com/Ak2556).
