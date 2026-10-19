# Contributing

Thank you for helping. Echo is **launch-sensitive**: it is heading for the app stores, so small,
scoped changes that preserve current behaviour are worth far more than ambitious ones. New features
are weighed against shipping; bug fixes, polish and tests are always welcome.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). **Security problems do not
go in issues or pull requests**: follow the [security policy](SECURITY.md).

## Start here

| You want to | Read |
|---|---|
| Run the app | [README, Getting started](README.md#getting-started) |
| Understand how it fits together | [`docs/architecture/`](docs/architecture/README.md), starting with the overview |
| Know why something is built the way it is | [`docs/architecture/07-decision-log.md`](docs/architecture/07-decision-log.md) |
| Avoid the traps that cost the most time | [Engineering notes](docs/engineering-notes.md) |

## Ground rules

- Do not change business logic unless you are fixing a clearly identified defect.
- Do not rename public APIs, routes, database objects, environment variables, auth behaviour or
  deployment behaviour without an explicit migration plan.
- Do not move files unless every import, test, doc and owner is updated.
- Do not add a dependency unless it is necessary and the owning area agrees. A native dependency
  also changes the build fingerprint (see [operations](docs/architecture/06-operations.md)).
- Do not mix unrelated cleanup with a product change.
- Keep secrets out of Git.
- **`android/` and `ios/` are generated** by `expo prebuild` and gitignored. Native configuration
  lives in `app.json`, `app.config.js` and `plugins/`. Never edit the generated projects.

## Branches and commits

Use a short prefix and a name that says what it is:

```text
feature/feed-empty-state
fix/auth-token-refresh
docs/local-development
chore/env-hygiene
```

Write commit messages that explain **why**, in the body, rather than restating the diff. A short
imperative subject, then the reason:

```text
Read receipts keep their promise: private read marker

Messages read while receipts were off must stay private if receipts
are switched back on, so the sweep only touches messages that were
unread at that moment.
```

## Pull requests

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck` and `test` on every pull request to `main`.
Match it locally before you push:

```bash
npm run lint
npm run typecheck
npm test
```

The pull request template asks for a **What and why**, the checks above, and an **Unverified**
section. Please fill the last one honestly: say what you did not check. It is the most useful
thing a reviewer can read.

Several tests exist to stop a class of mistake from reaching `main`. They fail on purpose when:

- a screen has no voice phrase, or a multiline field has no dictation handler
- a `profiles` column the client selects has no grant
- a client `upsert` has no UPDATE policy to land on
- the generated Phosphor icon shim is out of date (run `node scripts/gen-icon-shim.mjs`)
- the old public presence channel is used again

## Database changes

The schema's single source of truth is [`supabase/migrations/`](supabase/migrations/). There is no
other schema file to keep aligned.

- Prefer additive migrations. A destructive one needs a recovery plan, an RLS review and a client
  compatibility review.
- **Old builds stay in the field for weeks.** A migration must not break an installed app: do not
  drop a column an older client still selects until none do. Gate the breaking step.
- **Validate against the live schema before merging**, inside a transaction that always rolls
  back, and check afterwards that nothing persisted. Local replay is not faithful to production;
  see [`supabase/recovery/README.md`](supabase/recovery/README.md).
- A new table starts with **no client write grants**. Add exactly the grants the client needs,
  next to the policies.
- A client `upsert` needs an INSERT **and** an UPDATE policy: an upsert is an insert that becomes
  an update under RLS.
- Write policies as `(select auth.uid())`, never a bare `auth.uid()`: the bare call is re-evaluated
  for every row scanned.
- A function that takes a user id must check `auth.uid()` (or the service role) rather than trust
  the argument.
- Never call a function a role cannot execute from a superuser `SET ROLE` session while testing
  (check `has_function_privilege` first): it can crash the backend.
- `npm run probe:flows` runs real flows against a local Supabase stack and asserts outcomes. Add a
  probe when a change is about who may see or do what.

## AI changes

AI changes affect cost, latency and safety. For changes under `supabase/functions/echo-ai/`,
`supabase/functions/_shared/aiChat.ts`, `lib/ai/` or `supabase/functions/voice-command/`, say in the
pull request:

- which provider and model behaviour changes, and what happens when the provider fails
- streaming and abort behaviour
- how the call is metered: every branch that can reach a model must be counted
- any new environment variable or secret

The AI account is on a small quota. Failures that look like bugs are often quota.

## User interface

- Never hard-code a colour: use `useTheme()`.
- The interface is localised, not only the content: lay out for right-to-left (Arabic) and for
  long strings. Put user-visible strings through the i18n layer. `npm run i18n:generate` fills
  gaps; do not translate by hand into the generated file.
- Performance beats effect: do not put a live blur over scrolling content. Judge frame cost on a
  release build, not by eye.

## Security hygiene

Never commit:

- service-role keys
- AI, Apple, AWS, Expo, Cloudflare, Razorpay, RevenueCat or Supabase access tokens
- private keys, certificates, provisioning profiles or keystores
- local `.env` files
- personal machine paths or local tool configuration

Secrets live in your environment. `.env.example` lists the public client variables; server secrets
are set with `supabase secrets set` and in the host's own settings.
