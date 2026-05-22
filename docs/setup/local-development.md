# Local Development

This guide gets a new contributor from clone to a running local app without relying on private machine state.

## Prerequisites

- Node.js 20+
- npm
- Python 3.11+ for the optional FastAPI backend
- Xcode for iOS Simulator development
- Android Studio for Android Emulator development
- Supabase CLI for migrations and Edge Function work
- Expo account and EAS access for native build work

## Install

```bash
npm ci
cp .env.example .env
```

Fill `.env` with values for your own Supabase project or leave Supabase values blank to use the app's offline/mock fallback paths where supported.

## Run the Mobile App

```bash
npm start
```

Then choose iOS, Android, or web from the Expo terminal UI.

Platform commands:

```bash
npm run ios
npm run android
npm run web
```

The generated `ios/` and `android/` folders are ignored in this repository. Treat them as local build outputs unless a native ownership decision explicitly changes that policy.

## Frontend Environment

Root `.env` values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
SUPABASE_PROJECT_REF=your-project-ref
```

Only `EXPO_PUBLIC_*` values are available to the Expo client. They are not secret once shipped in the app.

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Backend `.env` values:

```env
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Use the service-role key only on the backend or trusted scripts. Never expose it through Expo variables.

## Supabase Setup

For local or staging Supabase work:

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
supabase functions deploy echo-ai
```

Set Edge Function secrets outside Git:

```bash
supabase secrets set OPENROUTER_API_KEY=your_key
supabase secrets set ECHO_AI_MODEL=google/gemini-2.5-flash
```

## Validation

Run the core checks before opening a PR:

```bash
npm run lint
npm run typecheck
npm test
```

For backend-only changes, also run:

```bash
python -m compileall backend/main.py backend/db/supabase.py
```

## Troubleshooting

- If Expo cannot see new env values, restart the Expo server.
- If device builds cannot reach the backend, use your LAN IP instead of `127.0.0.1`.
- If Supabase calls fail locally, confirm RLS policies, project URL, and anon key match the same project.
- If a native module fails in Expo Go, test with a development build before changing app logic.
