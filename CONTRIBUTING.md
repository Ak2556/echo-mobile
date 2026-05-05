# Contributing

Echo is launch-sensitive. Prefer small, scoped changes that preserve current product behavior.

## Ground Rules

- Do not change business logic unless you are fixing a clearly identified defect.
- Do not rename public APIs, routes, database models, environment variables, auth behavior, or deployment behavior without an explicit migration plan.
- Do not move files unless all imports, tests, docs, and owners are updated.
- Do not add dependencies unless the owning area agrees they are necessary.
- Do not mix unrelated cleanup with product changes.
- Keep secrets out of Git.

## Branches and Commits

Use focused branches such as:

```text
feature/feed-empty-state
fix/auth-token-refresh
docs/local-development
chore/env-hygiene
```

Commit messages should be concise and milestone-oriented:

```text
Add local development setup guide
Improve environment example hygiene
Fix feed fallback pagination test
```

## Ownership

Check [docs/team-ownership/ownership-map.md](docs/team-ownership/ownership-map.md) before editing files outside your normal area. Cross-area PRs should name the impacted owners in the PR description.

## Pull Request Checklist

Before opening a PR:

- Confirm the change is scoped to the stated task.
- Update docs when setup, deployment, testing, ownership, or environment behavior changes.
- Add or update focused tests when behavior changes.
- Run the relevant validation commands.
- Confirm no `.env`, credentials, local paths, build outputs, logs, or cache files are staged.
- Explain any skipped checks and why they were skipped.

Recommended commands:

```bash
npm run lint
npm run typecheck
npm test
```

## Database Changes

Database changes belong in `supabase/migrations/`. Prefer additive migrations. Destructive changes require:

- A rollback or recovery plan.
- Confirmation that RLS policies still protect all affected data.
- Client compatibility review.
- Migration testing against a non-production Supabase project.

Keep `backend/db/schema.sql` aligned when it is used as a reference schema.

## AI Changes

AI changes can affect UX, cost, latency, and safety. For changes under `supabase/functions/echo-ai/`, `lib/api.ts`, `lib/aiMemory.ts`, or `backend/main.py`, include:

- Model and provider behavior.
- Streaming behavior and abort behavior.
- Error handling and fallback behavior.
- Any new environment variables or secrets.

## Security

Never commit:

- Service-role keys.
- OpenAI, OpenRouter, Apple, AWS, Expo, or Supabase access tokens.
- Private keys, certificates, provisioning profiles, or keystores.
- Local `.env` files.
- Personal machine paths or local tool configuration.

Use [docs/security/environment-and-secrets.md](docs/security/environment-and-secrets.md) for secret handling.
