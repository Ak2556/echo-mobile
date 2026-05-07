# Environment and Secrets

This repository must be safe to clone, fork, and review without exposing private credentials.

## What Can Be Public

Expo variables with the `EXPO_PUBLIC_` prefix are embedded into the client bundle. Treat them as public configuration, not secrets.

Examples:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

The Supabase anon key is not a service secret, but it still identifies a project. RLS policies must be correct before using it in production.

## What Must Never Be Public

Never commit:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- AWS access keys
- Expo access tokens
- Apple private keys or provisioning material
- Database passwords
- Private certificates, keystores, or signing keys
- Local `.env` files
- Personal MCP or editor configuration with project-specific credentials

## Local Files

Use:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Both `.env` files are ignored by Git. Do not stage them.

## Runtime Secret Stores

Use the runtime store that matches the environment:

| Runtime | Store secrets in |
| --- | --- |
| Expo/EAS builds | EAS environment variables or secrets |
| Supabase Edge Functions | `supabase secrets set ...` |
| GitHub Actions | GitHub Actions secrets |
| FastAPI backend | Backend runtime environment or secret manager |
| Local development | `.env` and `backend/.env` only |

## Rotation Policy

Rotate a credential immediately if:

- It was committed to Git.
- It was pasted into a PR, issue, chat, or log.
- It was shared outside the owning team.
- A device or developer machine with the key is lost.

After rotation, verify the old credential no longer works and update only the approved secret store.

## Pre-Commit Secret Check

Before committing, inspect staged files:

```bash
git diff --cached --name-only
git diff --cached
```

Look for keys, tokens, personal paths, `.env` files, logs, generated native outputs, and local tool state.
