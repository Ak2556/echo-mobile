<div align="center">

<br />

<img src="./assets/images/icon.png" width="96" height="96" alt="Echo App Icon" />

<h1>Echo</h1>

<p><strong>A social platform where AI conversations become content.</strong></p>

<p>
  Chat with Gemini. Publish your best exchanges. Follow people doing the same.
</p>

<br />

[![CI](https://github.com/akashthakur/echo/actions/workflows/ci.yml/badge.svg)](https://github.com/akashthakur/echo/actions/workflows/ci.yml)
![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)
![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge-3ECF8E?logo=supabase)

<br />

</div>

---

## What is Echo?

Echo is a mobile-first social app that fuses an AI assistant with a public content feed. Every AI conversation you have can be "echoed" — published to a shared feed where other users can like, repost, comment on, and discover it.

The AI runs on Google Gemini (2.5 Flash / 2.5 Pro / 2.0 Flash Lite) through a Supabase Edge Function. The social layer runs on Supabase Postgres with full RLS. The mobile client is React Native (Expo) targeting iOS, Android, and Web from a single codebase.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Frontend Setup](#frontend-setup)
  - [Backend Setup](#backend-setup)
  - [Supabase Setup](#supabase-setup)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Database Schema](#database-schema)
- [CI / CD](#ci--cd)
- [Roadmap](#roadmap)
- [Developer](#developer)

---

## Features

**AI Chat**
- Streaming responses via SSE using Supabase Edge Functions (`echo-ai`)
- Tool-call UI with pending / result states
- Model switcher: Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash Lite
- Command palette (long-press the Chat tab anywhere)
- Persistent conversation sessions

**Social Feed**
- Discover tab with hero cards, story circles, and infinite-scroll feed
- Publish AI conversations as "Echoes" to the public feed
- Rich post types: text, photo (up to 4), video (with quality tiers), and polls
- Likes, reposts, comments, bookmarks, views — all denormalized via Postgres triggers
- Follow / unfollow users, followers / following lists
- Story creation and viewer
- Thread view with nested comments

**Messaging**
- Direct messages with conversation list and individual thread view
- Unread DM count badge on tab bar

**Notifications**
- Real-time activity feed (likes, follows, reposts, mentions)
- Unread count badge with spring animation

**Mini-Apps**
A self-contained utility suite embedded in the app:

| App | App | App |
|---|---|---|
| Calculator | BMI | Bill Splitter |
| Unit Converter | World Clock | Pomodoro Timer |
| Habit Tracker | Expense Log | Notes |
| Markdown Editor | JSON Formatter | Password Generator |
| Color Tools | Voice Memo | Video Player |
| Dice Roller | Camera | |

**Auth & Profiles**
- Email / password, phone OTP, Apple Sign-In
- Onboarding wizard with profile setup
- Avatar with color or uploaded image (Supabase Storage)
- Edit profile, verified badge, bio, display name

**UX**
- Floating glass-morphism tab bar with animated badges
- Dark / light mode (follows system)
- Haptics, smooth spring animations (Reanimated 4)
- Reduce-motion support
- MMKV for fast local state persistence

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React Native Client                          │
│  Expo Router (file-based) · Zustand · TanStack Query · NativeWind   │
└────────────────────────┬───────────────────────┬────────────────────┘
                         │                       │
              SSE stream │               REST/RPC │ (Supabase JS)
                         ▼                       ▼
          ┌──────────────────────┐   ┌────────────────────────────┐
          │  Supabase Edge Fn    │   │       Supabase Platform     │
          │  `echo-ai`           │   │  Postgres · Auth · Storage  │
          │  OpenRouter → Gemini │   │  Row Level Security         │
          └──────────────────────┘   │  pgvector (RAG embeddings)  │
                                     └────────────────────────────┘
                         │
              FastAPI    │   (legacy / local dev chat endpoint)
          ┌──────────────┘
          │  POST /chat/stream · SSE
          │  Feed, echoes, comments, likes, follows, notifications
          └──── Deployed via Docker → AWS ECS
```

The primary AI path runs through the Supabase Edge Function (`echo-ai`), which calls OpenRouter to reach Gemini. The FastAPI backend (`backend/`) acts as a secondary REST layer and is the deployment target for AWS ECS.

---

## Tech Stack

### Mobile Client

| Layer | Library | Version |
|---|---|---|
| Framework | React Native + Expo | 0.81 / ~54 |
| Routing | Expo Router | ~6.0 |
| Language | TypeScript | ~5.9 |
| Styling | NativeWind (Tailwind) | ^4.2 |
| State | Zustand | ^5.0 |
| Server state | TanStack Query | ^5.99 |
| Animations | React Native Reanimated | ~4.1 |
| Lists | Shopify FlashList | 2.0 |
| Storage | MMKV | ^4.3 |
| Auth / DB | Supabase JS | ^2.103 |
| Icons | Phosphor RN + Lucide RN | latest |
| React | React 19 + React Compiler | 19.1 |

React Native **New Architecture** is enabled. The **React Compiler** experiment is active.

### Backend

| Layer | Library |
|---|---|
| Framework | FastAPI |
| Runtime | Python 3.11+ / Uvicorn |
| AI | OpenAI SDK → Supabase Edge Fn → OpenRouter → Gemini |
| Database | Supabase (Postgres + pgvector) |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| Deployment | Docker → AWS ECR → ECS |

### Infrastructure

| Concern | Tool |
|---|---|
| Database | Supabase Postgres |
| Vector search | pgvector (HNSW index, 1536-dim) |
| Auth | Supabase Auth (email, phone, Apple) |
| File storage | Supabase Storage (`avatars`, `echo-media`) |
| Edge functions | Supabase Edge Runtime (Deno) |
| Container registry | Amazon ECR |
| Compute | Amazon ECS (Fargate) |
| CI | GitHub Actions |

---

## Project Structure

```
echo-main/
├── app/                        # Expo Router screens (file-based routing)
│   ├── (tabs)/                 # Tab navigator screens
│   │   ├── discover.tsx        # Home feed
│   │   ├── search.tsx          # User / content search
│   │   ├── echoes.tsx          # Your published echoes
│   │   ├── chat.tsx            # AI chat interface
│   │   ├── notifications.tsx   # Activity feed
│   │   ├── apps.tsx            # Mini-apps hub
│   │   └── profile.tsx         # Your profile
│   ├── auth/                   # Auth flow (login, signup, onboarding)
│   ├── messages/               # DM list + thread
│   ├── comments/               # Comment thread view
│   ├── thread/                 # Echo thread view
│   ├── user/                   # Public user profile
│   └── mini-apps/              # 17 embedded utility apps
│
├── components/
│   ├── ai/                     # Chat bubbles, tool-call cards, typing indicator
│   ├── social/                 # FeedCard, StoryCircles, HeroCard, FeedCardSkeleton
│   ├── ui/                     # GlassPanel, AnimatedPressable, Skeleton, etc.
│   ├── common/                 # Shared primitives
│   ├── notifications/          # Notification item components
│   ├── mini-apps/              # Mini-app component wrappers
│   └── profile/                # Profile-specific components
│
├── lib/
│   ├── api.ts                  # Supabase Edge Fn SSE client + model routing
│   ├── auth.ts                 # Auth helpers
│   ├── supabase.ts             # Supabase client init
│   ├── supabaseEchoApi.ts      # Typed Supabase query layer
│   ├── theme.ts                # Theme tokens + dark/light mode
│   ├── commandPalette.ts       # Global command palette state
│   └── remoteConfig.ts         # Remote feature flags
│
├── store/
│   └── useAppStore.ts          # Zustand store (UI state, auth, unread counts)
│
├── hooks/
│   └── queries/                # TanStack Query hooks (useFeed, etc.)
│
├── types/
│   └── index.ts                # Shared TypeScript interfaces
│
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # All routes (chat stream, feed, social actions)
│   ├── requirements.txt
│   └── db/
│       ├── schema.sql          # Full Postgres schema + RLS policies
│       └── supabase.py         # Supabase admin client
│
├── supabase/                   # Supabase migrations (managed via CLI)
│
├── .github/workflows/
│   ├── ci.yml                  # Lint · typecheck · tests on every push/PR
│   └── aws.yml                 # Docker build → ECR push → ECS deploy on main
│
└── env.example                 # Required environment variables
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm or bun
- Python 3.11+ (backend)
- [Expo Go](https://expo.dev/go) or a native development build for device testing
- A [Supabase](https://supabase.com) project
- An [OpenRouter](https://openrouter.ai) API key (for Gemini access)

### Frontend Setup

```bash
# Clone
git clone https://github.com/akashthakur/echo.git
cd echo

# Install dependencies
npm install

# Configure environment (see section below)
cp env.example .env
```

### Backend Setup

```bash
cd backend

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Fill in OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Run locally
python main.py
# → Listening on http://0.0.0.0:8000
```

### Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open the **SQL Editor** and run `backend/db/schema.sql` — this creates all tables, indexes, triggers, and RLS policies
3. Navigate to **Authentication → Providers** and enable:
   - Email
   - Phone (Twilio or Vonage)
   - Apple (requires Apple Developer account)
   - Anonymous (used for unauthenticated browsing)
4. Create two **Storage buckets**: `avatars` (public) and `echo-media` (public)
5. Deploy the `echo-ai` Edge Function from `supabase/functions/echo-ai/` with the required secrets:

```bash
supabase functions deploy echo-ai
supabase secrets set OPENROUTER_API_KEY=your_key
supabase secrets set ECHO_AI_MODEL=google/gemini-2.5-flash
```

---

## Environment Variables

### Frontend (`.env` in repo root)

```env
# Supabase project credentials (Settings → API)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# FastAPI backend (local: http://127.0.0.1:8000, device: use your LAN IP)
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

> **Note:** Leave `EXPO_PUBLIC_SUPABASE_URL` unset to run entirely with offline mock data.

### Backend (`backend/.env`)

```env
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Edge Function secrets (Supabase Dashboard → Edge Functions → Secrets)

```
OPENROUTER_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
ECHO_AI_MODEL         # e.g. google/gemini-2.5-flash
```

> Never commit real keys. Rotate any key that has ever been pushed to a public repository.

---

## Running the App

```bash
# Start the Expo dev server
npm start

# Platform-specific
npm run ios       # iOS Simulator
npm run android   # Android Emulator / device
npm run web       # Browser (static export)

# Quality checks
npm run lint
npm run typecheck
npm test          # Vitest unit tests
```

---

## Database Schema

All tables live in the `public` schema under Supabase Postgres. Row Level Security is enforced on every table.

| Table | Description |
|---|---|
| `profiles` | 1:1 with `auth.users`; username, display name, bio, avatar |
| `public_echoes` | Published AI conversations (prompt + response) with denormalized counters |
| `echo_likes` | Like join table; trigger increments/decrements `public_echoes.likes_count` |
| `echo_reposts` | Repost join table; same trigger pattern |
| `echo_views` | Deduped views per user per echo; trigger increments `view_count` |
| `echo_comments` | Comments on echoes; trigger increments/decrements `comment_count` |
| `echo_bookmarks` | User bookmarks (private; RLS-enforced) |
| `follows` | Follower / following graph; self-follow prevented by CHECK constraint |
| `rag_embedding_messages` | Conversation messages with 1536-dim embeddings (HNSW index via pgvector) |

Counters are maintained by Postgres triggers — no application-side increment logic required.

---

## CI / CD

**Continuous Integration** (`ci.yml`) runs on every push and pull request to `main`:

```
npm ci → eslint → tsc --noEmit → vitest run
```

**Continuous Deployment** (`aws.yml`) triggers on push to `main`:

```
docker build → push to Amazon ECR → update ECS task definition → deploy to ECS cluster
```

Secrets required in GitHub Actions: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

---

## Roadmap

- [ ] Supabase Realtime for live feed updates and DMs
- [ ] Full RAG pipeline wired to `rag_embedding_messages` (semantic memory across sessions)
- [ ] EAS Build pipeline for App Store / Play Store distribution
- [ ] Admin moderation dashboard for reported content
- [ ] Push notifications (Expo Notifications + APNs / FCM)
- [ ] Trending hashtags and explore algorithm
- [ ] Echo analytics (per-post impressions, reach breakdown)
- [ ] Web (Next.js) companion app

---

## Developer

**Akash Thakur** — AI/ML Engineer & Founder

- GitHub: [@akashthakur](https://github.com/akashthakur)
- Email: [akash.thakur.dev@gmail.com](mailto:akash.thakur.dev@gmail.com)

---

<div align="center">

Built with React Native, Supabase, and Gemini.

</div>
