# Team Ownership Map

Use this map to keep work independent and reviews focused. When a change crosses areas, name each impacted area in the PR description.

| Team | Owns | Primary paths | Review expectations |
| --- | --- | --- | --- |
| Frontend | Screens, navigation, UI components, client state, app assets | `app/`, `components/`, `hooks/`, `store/`, `constants/`, `assets/`, `global.css`, `tailwind.config.js` | Validate affected screens on at least one mobile target. Avoid changing backend contracts without coordination. |
| Backend/API | FastAPI routes, backend dependencies, backend database helpers | `backend/` | Keep route behavior compatible with frontend clients. Document new backend env vars. |
| AI/LLM | AI streaming, prompts, model routing, AI memory/title helpers | `supabase/functions/echo-ai/`, `lib/api.ts`, `lib/aiMemory.ts`, `lib/aiTitle.ts`, `backend/main.py` | Check streaming, retries, aborts, and secret usage. Include cost/provider notes for model changes. |
| Database | Migrations, RLS, triggers, indexes, reference schema | `supabase/migrations/`, `backend/db/schema.sql`, `supabase/config.toml` | Prefer additive migrations. Review RLS and rollback impact. |
| Infrastructure/DevOps | CI, EAS, deployment, Docker context, release configuration | `.github/workflows/`, `app.json`, `eas.json`, `.dockerignore` | Avoid accidental production release changes. Keep secrets in provider-managed stores. |
| QA/Testing | Test strategy, test utilities, release verification | `*.test.ts`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`, `docs/testing/` | Require focused tests or manual verification notes for behavior changes. |
| Documentation | Setup, architecture, contribution, deployment, ownership docs | `README.md`, `CONTRIBUTING.md`, `docs/` | Keep docs aligned with actual commands and repository structure. |
| Security | Secrets, auth safety, RLS posture, dependency hygiene | `.gitignore`, `.env.example`, `backend/.env.example`, auth code, Supabase policies, workflows | No real secrets in Git. Review service-role, token, auth, and RLS changes carefully. |

## Cross-Area Coordination

- Frontend plus Database: required for schema-dependent UI changes.
- Frontend plus AI: required for streaming payload, model, prompt, or tool-call UI changes.
- Backend plus Infrastructure: required for deploy, Docker, runtime, or environment changes.
- Security plus any area: required for auth, RLS, secret handling, token storage, or provider credential changes.

## Boundaries to Avoid

- Do not update migrations casually from a frontend-only PR.
- Do not change `app.json`, `eas.json`, or workflows from a UI polish PR.
- Do not change shared `lib/` behavior without checking all callers.
- Do not introduce new environment variables without updating `.env.example`, backend examples, and docs.
