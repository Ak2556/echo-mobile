# Deployment Guide

Echo has multiple deployment surfaces. Keep them separate so teams can release safely.

## CI

GitHub Actions CI is defined in `.github/workflows/ci.yml` and runs:

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

CI currently targets pushes and pull requests to `main`.

## Expo and EAS

Expo configuration lives in:

- `app.json`
- `eas.json`

Before a release build:

```bash
npx eas build --profile preview --platform ios
npx eas build --profile preview --platform android
```

For production releases, use the `production` profile only after the release checklist is complete and environment variables are configured in EAS.

Do not commit private EAS tokens or signing material.

## Supabase

Migrations live in `supabase/migrations/`.

Typical staging flow:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Edge Functions live in `supabase/functions/`.

Deploy an Edge Function:

```bash
supabase functions deploy echo-ai
```

Set Edge Function secrets through Supabase:

```bash
supabase secrets set OPENROUTER_API_KEY=your_key
supabase secrets set ECHO_AI_MODEL=google/gemini-2.5-flash
```

## FastAPI Backend

The backend service lives in `backend/`. It can run locally with:

```bash
cd backend
python main.py
```

Production deployment must provide:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## AWS/ECS Workflow

`.github/workflows/aws.yml` contains an ECS deployment workflow configuration. It references Docker/ECS settings that must be provided before it can be used for production:

- AWS region
- ECR repository
- ECS service
- ECS cluster
- ECS task definition
- Container name
- A Dockerfile and task definition asset, if ECS deployment is the chosen production path

Treat this workflow as not launch-ready until those values and assets are confirmed.

## Release Checklist

- CI passes.
- App builds in the target EAS profile.
- Supabase migrations are tested in staging.
- Edge Function secrets are configured outside Git.
- Backend runtime secrets are configured outside Git.
- Rollback path is known for app, database, Edge Functions, and backend.
- Manual smoke test is complete on the target platform.
