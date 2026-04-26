# Echo

Echo is an Expo React Native social app where AI conversations can become public posts. The mobile client talks to Supabase for auth, data, storage, realtime features, and Edge Functions, with a small FastAPI backend kept for local and secondary API flows.

This repository is organized for a team-based launch. The app behavior should stay stable: changes should be scoped, reviewed by the owning area, and validated before merge.

## Quick Start

Prerequisites:

- Node.js 20+
- npm
- Expo CLI through `npx expo`
- Python 3.11+ for the optional FastAPI backend
- Supabase CLI for migrations and Edge Functions

Install and run the mobile app:

```bash
npm ci
cp .env.example .env
npm start
```

Common mobile commands:

```bash
npm run ios
npm run android
npm run web
```

Run the optional FastAPI backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Run local validation before opening a PR:

```bash
npm run lint
npm run typecheck
npm test
```

## Repository Map

| Area | Paths | Notes |
| --- | --- | --- |
| Frontend | `app/`, `components/`, `hooks/`, `store/`, `constants/`, `assets/` | Expo Router screens, reusable UI, state, and app assets. |
| Shared TypeScript | `lib/`, `types/` | Client API helpers, Supabase adapters, local utilities, tests, and shared types. |
| Backend/API | `backend/` | FastAPI service and backend database helpers. |
| AI/LLM | `lib/api.ts`, `lib/aiMemory.ts`, `lib/aiTitle.ts`, `supabase/functions/echo-ai/`, `backend/main.py` | Streaming AI client, Edge Function routing, memory/title helpers, and legacy backend chat stream. |
| Database | `supabase/migrations/`, `backend/db/schema.sql` | Supabase migrations plus reference schema. |
| Infrastructure/DevOps | `.github/workflows/`, `eas.json`, `app.json`, `supabase/config.toml` | CI, EAS, app metadata, Supabase local config, and deployment workflows. |
| QA/Testing | `*.test.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json` | Unit tests, lint, and type checks. |
| Documentation | `docs/`, `CONTRIBUTING.md`, `README.md` | Team workflow, setup, architecture, security, testing, and deployment guidance. |

## Environment

Copy the root example file and fill values that match your own Supabase and backend environments:

```bash
cp .env.example .env
```

Frontend variables use the `EXPO_PUBLIC_` prefix because Expo embeds them into the app bundle. Do not put service-role keys, provider secrets, private tokens, or database passwords in any `EXPO_PUBLIC_` variable.

Backend-only secrets belong in `backend/.env`, Supabase secrets, EAS environment variables, or GitHub Actions secrets depending on the runtime.

See [docs/security/environment-and-secrets.md](docs/security/environment-and-secrets.md) for the full policy.

## Architecture

Echo has three main runtime surfaces:

- Expo React Native client for iOS, Android, and web.
- Supabase for auth, Postgres, storage, realtime data, migrations, and Edge Functions.
- FastAPI backend for local or secondary API behavior.

The primary app code path should stay in the frontend and Supabase layers unless backend ownership signs off on a backend/API change. AI changes should be reviewed against both client streaming behavior and Supabase Edge Function behavior.

Detailed architecture notes: [docs/architecture/overview.md](docs/architecture/overview.md).

## Team Workflow

Use ownership boundaries to keep PRs easy to review:

- Frontend changes should stay in screens, components, hooks, store, and frontend utilities.
- Backend/API changes should stay in `backend/` unless a client contract update is required.
- AI/LLM changes should include streaming, model, prompt, and fallback review.
- Database changes should be additive migrations unless a breaking migration is explicitly approved.
- Infrastructure changes should not alter release behavior without a deployment review.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/team-ownership/ownership-map.md](docs/team-ownership/ownership-map.md).

## Testing

Required pre-PR checks:

```bash
npm run lint
npm run typecheck
npm test
```

Use targeted manual checks for the area you touched. For example, auth changes need sign-in/sign-out coverage, feed changes need remote and fallback feed checks, and AI changes need streaming and abort/retry checks.

Testing guide: [docs/testing/testing-guide.md](docs/testing/testing-guide.md).

## Deployment

Deployment surfaces are split by runtime:

- Expo/EAS for mobile builds and app updates.
- Supabase CLI for migrations and Edge Functions.
- GitHub Actions for CI.
- AWS/ECS workflow is present but requires production values and Docker/task definition assets before it can deploy successfully.

Deployment guide: [docs/deployment/deployment-guide.md](docs/deployment/deployment-guide.md).

## Maintainers

Repository stewardship is assigned to `Ak2556`. Keep commits, PR descriptions, documentation, and release notes professional and free of unrelated personal metadata.
