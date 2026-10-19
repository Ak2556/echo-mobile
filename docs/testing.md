# Testing

[← Documentation](README.md)

**Unit — 2,413 tests across 270 files, Vitest.** Covers feed filtering and scoring, the engagement model, publish validation, marketplace logic, URL safety, the age gate boundaries, i18n date handling, the voice intent dispatcher, presence and read-state logic, and source guards that read the code or the migrations.

Several exist to pin bugs that were invisible in review rather than to describe behaviour: that the auth lock actually serializes, that the session on disk is unreadable, that every `profiles` column the client selects is granted, that the DM thread renders through the real bubble renderer, that no screen ships without a way to reach it by voice, that every client `upsert` has an UPDATE policy to land on, that no client opens the old public presence channel, and that the icon shim in the bundle matches the icons the app imports.

**End-to-end — Maestro.** A cold-launch flow runs on every pull request against an Android emulator, on a real release APK: first paint, and the Terms and Privacy routes. The last eight pull-request runs are green. Budget ~40 minutes for the job; the release build alone is around 31.

**Flow probes — 93 checks, `npm run probe:flows`.** Not unit tests: they run the real flows against a local Supabase stack with throwaway users and assert outcomes — sign-up, posting, follows and private accounts, DMs including a stranger and a blocked user, the daily question, the privileges a client role actually holds, presence and read receipts (including that a receipt toggle hides what was read), account erasure leaving no row behind, and the edge-function auth gates. The first run found that editing a Daily Question answer had never worked (an upsert with no UPDATE policy). They are not in CI. `npm run audit:backend` is the production counterpart: it calls each RPC for real.

**Recovery drill.** `supabase/recovery/` plus `scripts/rebuild-db.sh` rebuild an empty database from the repository alone in about a second (schema, auth and storage objects, queues, cron, seed content), and the probes pass on the result. See [`supabase/recovery/README.md`](../supabase/recovery/README.md). Migrations alone do not replay faithfully, which is why the bundle exists.

The signed-in flows — bottom-tab navigation and DM threads — stay manual, because sign-in is a one-time code sent to a real inbox and CI has no way to receive it. Flows and their prerequisites are documented in [`e2e/`](../e2e/).

**Human — 20 testers across ten age groups.** The build is in the hands of people spanning ten age brackets, on their own devices and in their own languages. Automated tests catch regressions; they don't tell you that a filter tab reads as a button to a sixteen-year-old and as decoration to a sixty-year-old, or that a Hindi speaker looks for the mic before the keyboard. Most of the interface changes worth making so far have come from watching someone hold the phone.
