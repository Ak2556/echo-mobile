# Database recovery

How to get Echo's database back if the Supabase project is lost or damaged, what is and is not
recoverable from this repo, and the drill that proves the repo half works.

Production: Supabase project `eyokhisijabitzjiydmz` (Tokyo), about 75 MB, 93 public tables.
Supabase takes daily physical backups (7 kept). **Point-in-time recovery is off.** No restore has been
tested on the hosted side.

## What is in this folder

| File | Holds |
|---|---|
| `schema.sql` | `supabase db dump` of production: extensions, tables, functions, policies, triggers, the realtime publication, the trending matview. Stamped `-- through migration: <version>`. |
| `auth-storage.sql` | What the dump drops outside `public`: the signup trigger on `auth.users`, the 6 storage buckets, the 24 `storage.objects` policies. |
| `bootstrap.sql` | The 10 pgmq queues and the 9 pg_cron jobs (8 active). **No secrets.** Warns about missing vault secrets. |
| `seed-content.sql` | Reference content only, no personal data: badges, quests, the question bank, the 429 pre-generated daily questions, the feature flags (values as of the snapshot date: check them against intent). |

`scripts/rebuild-db.sh <url>` applies them in that order, replaying any `supabase/migrations/*`
newer than the snapshot's stamp on top, and prints a summary. It refuses a database that already has
public tables.

## Rebuild into a new project

1. Create a new Supabase project (same Postgres major version; enable the `pgmq`, `pg_cron`,
   `vector`, `pg_net`, `supabase_vault` extensions if the dashboard lists them separately).
2. `scripts/rebuild-db.sh "<new project postgres url>"`. Expect no `ERROR` lines; the only warning is the
   vault list.
3. **Vault secrets** (values live in the owner's password manager, never in the repo). Create each:
   `select vault.create_secret('<value>', '<name>');`
   `project_url` (the new project's URL), `service_role_key` (the new project's), `push_fanout_secret`,
   `daily_push_secret`, `personalized_push_secret`, `embed_echo_secret`, `ops_probe_secret`,
   `worker_secret`, `heartbeat_url`. The cron jobs call the edge functions through these, so a rebuilt
   database with an empty vault looks healthy and does nothing (`cron.job_run_details` says
   "succeeded" for jobs that were only queued).
4. **Edge function secrets**: `supabase secrets set ...` for each secret the functions read (the three
   shared secrets above must equal the vault values; plus the model keys, Resend, Razorpay,
   RevenueCat, LiveKit, the R2 worker URL and purge secret). `supabase secrets list` on the old project
   names them while it exists.
5. `supabase functions deploy` for every function in `supabase/functions/`. `verify_jwt` settings are in
   `supabase/config.toml`.
6. Point the app (`EXPO_PUBLIC_SUPABASE_URL` / anon key) and the R2 worker (its Supabase URL) at the new
   project, then ship an update. Phones on the old URL need an OTA or a build.
7. Verify with `npm run probe:flows` against a local stack built the same way, and with a signed-in
   account on the real build.

## What this folder does NOT recover

- **User data.** Profiles, echoes, follows, messages, answers: only a Supabase backup (or PITR) has them.
  Restore the backup into the new project first, then run `bootstrap.sql` and the vault step; the schema
  file is for a project with no backup left.
- **Passwords and sessions** (auth schema data) come back only with a backup.
- **Media.** Photos and video are in Cloudflare R2, not Postgres. Check R2 versioning and retention
  separately.
- **End-to-end encryption keys** live on the devices. Without them, restored DM ciphertext is unreadable by
  design.
- **Secret values.** Only their names are recorded here.

## Owner-only checklist

- [ ] Enable point-in-time recovery (paid add-on) and note the retention window.
- [ ] Take a backup and restore it into a scratch project once, then run the probes against it. A backup
      that has never been restored is not a backup.
- [ ] Create `heartbeat_url` (a Healthchecks.io style dead-man's-switch URL) and store it in the vault.
      Until then the external ping never fires: the `heartbeat` cron job succeeds every five minutes and
      `send_heartbeat()` returns immediately when the secret is absent.
- [ ] Keep every vault and function secret value in the password manager.
- [ ] Decide R2 versioning / retention for user media.
- [ ] Repeat the drill below each quarter, and after any change to cron, queues or the vault.

## Refreshing this folder

```bash
supabase db dump --linked -f supabase/recovery/schema.sql   # then re-add the 'through migration' stamp
```

Re-stamp with the newest version in `supabase/migrations/`. Until you do, the rebuild replays the newer
migrations on top, so a stale snapshot costs time, not correctness. `test/recoveryBundle.test.ts` fails
if the stamp points at no migration or the tail grows past 40.

## Drill record

**2026-10-16, local Supabase stack, empty database each time.**

- *Bundle alone:* rebuilt in 1 second. 93 public tables, 0 with RLS off, 220 policies, 10 queues, 9 cron
  jobs, 429 daily questions. `npm run probe:flows`: **61 passed, 0 failed**.
- *Stale snapshot plus tail:* the older dump (without the daily-answer update policy) stamped through
  `20261009120000`, replayed one newer migration, came out complete: 220 policies, 61 of 61 probes.
  The first attempt of the drill found the problem this mechanism fixes: a snapshot taken before a
  migration silently lacked it, and the probes caught it.
- *Migrations alone* (all 218 in order, no snapshot): one migration errors
  (`20260904090000`, `relation "public.calls" does not exist`). The result has 91 of 93 tables, 210 of 220
  policies, 266 of 272 indexes, 149 of 150 functions. Objects on production that no migration creates:
  tables `calls` and `rag_embedding_messages` (the client uses neither), the function `rls_auto_enable`,
  nine policies on `echo_bookmarks`, `echo_comments`, `echo_likes`, `follows` and `profiles` (including
  "Anon can read profiles"), and a few indexes. One index (`echo_bookmarks_echo_id_user_id_key`) exists in
  migrations and not on production. So migrations alone are close but not faithful; this folder is the
  source of truth for a rebuild.
- Not done: restoring a Supabase backup (no PITR, nothing to restore to), and any of it against hosted
  Supabase. The 75 MB size and the 1-second rebuild suggest the data restore, not the schema, is the long
  part.
