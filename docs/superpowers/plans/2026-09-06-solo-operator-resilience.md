# Solo-Operator Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give one person the ability to turn a feature off, know when a
scheduled job dies, and recover the database — without a rebuild, an OTA, or a
support contract.

**Architecture:** Feature flags move from compile-time constants to a
Supabase table read at launch and cached in the existing sync storage, with the
compiled map demoted to a fail-safe default. Cron health is derived from
`cron.job_run_details` joined against `net._http_response`, because pg_cron
reports `succeeded` for a job that ran and did nothing. Backups are a nightly
`pg_dump` pushed to the R2 bucket that already exists.

**Tech Stack:** Expo/React Native 0.81 (SDK 54), Supabase Postgres + pg_cron +
pg_net, Cloudflare R2, GitHub Actions, Vitest.

**Spec:** No separate spec. The findings this plan answers are recorded in
`docs/runbook/monitoring.md` and `docs/compliance/launch-and-first-year.md`.

## Global Constraints

- **Feature freeze.** Only operational safety and store blockers. No product features.
- **Fail safe, never fail open or closed by accident.** A flag with no remote row, an unreachable network, or a corrupt cache must resolve to the compiled default in `lib/featureFlags.ts`.
- **Sync flag reads.** `SETTINGS_ROWS` in `app/(tabs)/you.tsx:92` is module scope. Any API that requires `await` at read time breaks it.
- **Never edit `ios/` or `android/`** — gitignored CNG output. Native behaviour is configured in `app.json` / `app.config.js` / `plugins/`.
- **Supabase CLI, never the claude.ai connector** — it resolves to the wrong project.
- **Commits carry no AI attribution.**
- New native imports at module load break unrelated tests until stubbed in `test/stubs/`.
- Migration timestamps must sort after `20260904091000`.

---

### Task 1: Remote flag table

**Files:**
- Create: `supabase/migrations/20260907090000_feature_flags.sql`

**Interfaces:**
- Produces: table `public.feature_flags(key text primary key, enabled boolean not null, note text, updated_at timestamptz not null default now())`, readable by `anon` and `authenticated`, writable by nobody through the API.

- [ ] **Step 1: Write the migration**

```sql
-- Remote kill switch. lib/featureFlags.ts stays as the compiled DEFAULT; this
-- table is an override layer, so an unreachable database means the app behaves
-- exactly as it shipped rather than losing all its features.
--
-- Writable only through the dashboard or service role: a client that can flip
-- another user's flags is a privilege escalation, and nothing in the app needs
-- to write here.
create table if not exists public.feature_flags (
  key        text        primary key,
  enabled    boolean     not null,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Read-only to everyone, including signed-out users: the flag set has to be
-- resolvable before auth, because it gates the shell the user lands in.
create policy "anyone reads feature flags"
  on public.feature_flags for select
  to anon, authenticated
  using (true);

-- Seeded from the compiled defaults as of 2026-09-06 so the first fetch is a
-- no-op rather than a surprise.
insert into public.feature_flags (key, enabled, note) values
  ('dailyQuestion', true,  'Daily-question banner on Discover'),
  ('salons',        false, 'Salons browse/create'),
  ('officeHours',   false, 'Office hours list + RSVP'),
  ('yearInEcho',    false, 'Annual recap'),
  ('quests',        false, 'Quests with XP'),
  ('badges',        false, 'Achievement badges'),
  ('stories',       false, 'Ephemeral 24h stories'),
  ('miniApps',      true,  'Productivity mini-apps'),
  ('liveAudio',     false, 'LiveKit audio rooms')
on conflict (key) do nothing;

comment on table public.feature_flags is
  'Remote overrides for lib/featureFlags.ts. Flip a row to disable a feature without a build. See docs/runbook/monitoring.md.';
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`
Expected: applies cleanly. If it reports migrations out of sync, STOP — the
history drift recorded in `docs/runbook/monitoring.md` must be repaired first
with `supabase migration repair`.

- [ ] **Step 3: Verify anon can read and cannot write**

```bash
curl -s "$SUPABASE_URL/rest/v1/feature_flags?select=key,enabled" -H "apikey: $ANON_KEY" | head -c 300
# Prefer: return=representation, NOT the status code.
curl -s -X PATCH "$SUPABASE_URL/rest/v1/feature_flags?key=eq.miniApps" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' -d '{"enabled":false}'
```
Expected: the read returns 9 rows; the write returns `[]`.

**Do not test this with the status code.** A blocked PATCH returns **204**, the
same as a successful one — RLS does not reject the statement, it matches zero
rows, and "updated nothing" and "updated everything" look identical from the
outside. `return=representation` shows the rows actually written, which is the
only answer that distinguishes them. Confirm the data too: re-read the table and
check `miniApps` is still `true` and all 9 rows are present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260907090000_feature_flags.sql
git commit -m "feat(ops): remote feature-flag table"
```

---

### Task 2: Flag resolution with a fail-safe default

**Files:**
- Create: `lib/remoteFlags.ts`
- Create: `lib/remoteFlags.test.ts`
- Modify: `lib/featureFlags.ts` — `FLAGS` is currently a private const; add `export` to it. Leave `features` and `isFeatureEnabled` in place for now; Task 3 removes them once the last consumer is gone.

**Danger:** after this task there are briefly two functions named
`isFeatureEnabled` — the compiled-only one in `featureFlags.ts` and the
remote-aware one here. An import from the wrong module silently bypasses the
kill switch. Task 3 Step 5 deletes the old one; do not skip it.

**Interfaces:**
- Consumes: `FLAGS` and `FeatureFlag` from `lib/featureFlags.ts`; `storage` from `store/persist.ts`.
- Produces:
  - `isFeatureEnabled(flag: FeatureFlag): boolean` — synchronous
  - `refreshRemoteFlags(): Promise<void>`
  - `subscribeToFlags(fn: () => void): () => void`
  - `__resetFlagsForTest(): void`

- [ ] **Step 1: Write the failing test**

```ts
// lib/remoteFlags.test.ts
import { describe, expect, it, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('../store/persist', () => ({
  storage: {
    getString: (k: string) => store.get(k),
    set: (k: string, v: string) => { store.set(k, v); },
    delete: (k: string) => { store.delete(k); },
    clearAll: () => { store.clear(); },
  },
}));

const selectMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: selectMock }) },
}));

import { isFeatureEnabled, refreshRemoteFlags, subscribeToFlags, __resetFlagsForTest } from './remoteFlags';

beforeEach(() => {
  store.clear();
  selectMock.mockReset();
  __resetFlagsForTest();
});

describe('flag resolution', () => {
  it('falls back to the compiled default when nothing is cached', () => {
    // miniApps ships true, salons ships false.
    expect(isFeatureEnabled('miniApps')).toBe(true);
    expect(isFeatureEnabled('salons')).toBe(false);
  });

  it('lets a remote row override the compiled default', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('keeps the last good value when the fetch fails', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    selectMock.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(false);
  });

  it('ignores keys that are not real flags', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'notAFlag', enabled: true }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('ignores a row whose enabled is not a boolean', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: 'yes' }], error: null });
    await refreshRemoteFlags();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('falls back to compiled defaults when the cache is corrupt', () => {
    store.set('echo:remoteFlags', '{not json');
    __resetFlagsForTest();
    expect(isFeatureEnabled('miniApps')).toBe(true);
  });

  it('notifies subscribers only when a value actually changed', async () => {
    const seen = vi.fn();
    const unsub = subscribeToFlags(seen);
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: true }], error: null });
    await refreshRemoteFlags();
    expect(seen).not.toHaveBeenCalled();
    selectMock.mockResolvedValue({ data: [{ key: 'miniApps', enabled: false }], error: null });
    await refreshRemoteFlags();
    expect(seen).toHaveBeenCalledTimes(1);
    unsub();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run --project logic lib/remoteFlags.test.ts`
Expected: FAIL — `Cannot find module './remoteFlags'`.

- [ ] **Step 3: Implement**

```ts
// lib/remoteFlags.ts
/**
 * Remote overrides for lib/featureFlags.ts.
 *
 * The compiled map stays the DEFAULT and this is a layer on top, which is the
 * whole safety property: an unreachable database, a corrupt cache or a flag
 * that has no row all resolve to what shipped. A design that fetched the flag
 * set and used it as the source of truth would turn one bad network into an
 * app with no features.
 *
 * Reads are synchronous because app/(tabs)/you.tsx builds its menu at module
 * scope. The cache is hydrated from the same sync storage the Zustand store
 * uses, so the first paint after a cold start already has the last known
 * values; the network refresh only matters for the second launch onward.
 */
import { FLAGS, type FeatureFlag } from './featureFlags';
import { storage } from '../store/persist';
import { supabase } from './supabase';

const CACHE_KEY = 'echo:remoteFlags';

let overrides: Partial<Record<FeatureFlag, boolean>> = {};
const listeners = new Set<() => void>();

function isKnownFlag(key: string): key is FeatureFlag {
  return Object.prototype.hasOwnProperty.call(FLAGS, key);
}

function hydrate(): void {
  overrides = {};
  let raw: string | undefined;
  try { raw = storage.getString(CACHE_KEY); } catch { return; }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (isKnownFlag(key) && typeof value === 'boolean') overrides[key] = value;
    }
  } catch {
    // A corrupt cache is not worth a crash and not worth keeping.
    try { storage.delete(CACHE_KEY); } catch { /* ignore */ }
  }
}

hydrate();

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const override = overrides[flag];
  return typeof override === 'boolean' ? override : FLAGS[flag];
}

export function subscribeToFlags(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function refreshRemoteFlags(): Promise<void> {
  const { data, error } = await supabase.from('feature_flags').select('key, enabled');
  // Any failure keeps the last good values. Clearing them on a transient
  // network error would make the app change shape whenever the user's train
  // goes into a tunnel.
  if (error || !Array.isArray(data)) return;

  const next: Partial<Record<FeatureFlag, boolean>> = {};
  for (const row of data as Array<{ key?: unknown; enabled?: unknown }>) {
    if (typeof row.key === 'string' && isKnownFlag(row.key) && typeof row.enabled === 'boolean') {
      next[row.key] = row.enabled;
    }
  }

  const changed = (Object.keys(FLAGS) as FeatureFlag[])
    .some(k => (next[k] ?? FLAGS[k]) !== (overrides[k] ?? FLAGS[k]));

  overrides = next;
  try { storage.set(CACHE_KEY, JSON.stringify(next)); } catch { /* cache is best-effort */ }
  if (changed) for (const fn of listeners) fn();
}

/** Test seam: re-read the cache and drop subscribers. */
export function __resetFlagsForTest(): void {
  listeners.clear();
  hydrate();
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project logic lib/remoteFlags.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole suite — a new module-load import can break unrelated tests**

Run: `npm test`
Expected: all files pass. A failure mentioning `react-native-mmkv` or
`@supabase/supabase-js` means a stub is needed in `test/stubs/`.

- [ ] **Step 6: Commit**

```bash
git add lib/remoteFlags.ts lib/remoteFlags.test.ts lib/featureFlags.ts
git commit -m "feat(ops): resolve feature flags remotely, with the compiled map as fallback"
```

---

### Task 3: Make the consumers reactive

**Files:**
- Create: `hooks/useFeature.ts`
- Modify: `components/common/V2FeatureGuard.tsx:5,25`
- Modify: `app/(tabs)/you.tsx:37,92-96`
- Modify: `app/(tabs)/home.tsx:49,586,611,653`

**Interfaces:**
- Consumes: `isFeatureEnabled`, `subscribeToFlags` from `lib/remoteFlags.ts`.
- Produces: `useFeature(flag: FeatureFlag): boolean`.

- [ ] **Step 1: Write the hook**

```ts
// hooks/useFeature.ts
import { useSyncExternalStore } from 'react';
import { isFeatureEnabled, subscribeToFlags } from '../lib/remoteFlags';
import type { FeatureFlag } from '../lib/featureFlags';

/**
 * Re-renders when a flag changes. useSyncExternalStore rather than
 * useState+useEffect so the value read during render is never a frame behind
 * the store — which matters here because a flag flip is usually an emergency.
 */
export function useFeature(flag: FeatureFlag): boolean {
  return useSyncExternalStore(
    subscribeToFlags,
    () => isFeatureEnabled(flag),
    () => isFeatureEnabled(flag),
  );
}
```

- [ ] **Step 2: Move `SETTINGS_ROWS` inside the component**

It is module scope today, so it captures the flag once at import and a remote
flip can never reach it. In `app/(tabs)/you.tsx`, delete the module-level
`const SETTINGS_ROWS = [...]` block at lines 92-96 and rebuild it inside the
component that reads it:

```tsx
const miniAppsEnabled = useFeature('miniApps');
const settingsRows = useMemo(() => ([
  { key: 'bookmarks', Icon: BookmarkSimple, label: 'Bookmarks', route: '/bookmarks' as Href },
  ...(miniAppsEnabled ? [{ key: 'apps', Icon: SquaresFour, label: 'Tools', route: '/(tabs)/apps' as Href }] : []),
  { key: 'verify', Icon: SealCheck, label: 'Get verified', route: '/get-verified' as Href },
]), [miniAppsEnabled]);
```

Replace every `SETTINGS_ROWS` reference with `settingsRows`, and import
`useMemo` from react and `useFeature` from `../../hooks/useFeature`.

- [ ] **Step 3: Swap the remaining consumers**

In `components/common/V2FeatureGuard.tsx`, replace
`const enabled = features[flag];` with `const enabled = useFeature(flag);` and
change the import from `features, FeatureFlag` to `type FeatureFlag` plus the
hook.

In `app/(tabs)/home.tsx`, replace `features.dailyQuestion` and both
`features.stories` reads with hook calls made at the top of the component:

```tsx
const dailyQuestionEnabled = useFeature('dailyQuestion');
const storiesEnabled = useFeature('stories');
```

- [ ] **Step 4: Verify nothing still reads the compiled map directly**

Run: `grep -rn "features\." --include="*.tsx" --include="*.ts" app src components hooks | grep -v featureFlags.ts`
Expected: no output.

- [ ] **Step 5: Delete the old API so there is exactly one way to read a flag**

Nothing imports them any more. In `lib/featureFlags.ts`, delete both:

```ts
export function isFeatureEnabled(flag: FeatureFlag): boolean { return FLAGS[flag]; }
export const features = FLAGS;
```

leaving only `export const FLAGS` and `export type FeatureFlag`. Keeping a
compiled-only `isFeatureEnabled` next to the remote-aware one in
`lib/remoteFlags.ts` is a trap: both names typecheck, both look correct in
review, and the wrong one ignores the kill switch in an emergency.

- [ ] **Step 6: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: both clean. A `Cannot find name 'features'` error means a consumer
was missed — fix it rather than restoring the export.

- [ ] **Step 7: Commit**

```bash
git add hooks/useFeature.ts lib/featureFlags.ts components/common/V2FeatureGuard.tsx "app/(tabs)/you.tsx" "app/(tabs)/home.tsx"
git commit -m "feat(ops): read feature flags through a hook so a remote flip re-renders"
```

---

### Task 4: Refresh on launch and on foreground

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `refreshRemoteFlags` from `lib/remoteFlags.ts`.

- [ ] **Step 1: Wire it in**

Inside the root layout component, alongside the other app-wide effects:

```tsx
useEffect(() => {
  // Throttled: a flag flip is rare and this must never become a per-resume
  // round trip on a metered connection.
  let last = 0;
  const MIN_GAP_MS = 5 * 60 * 1000;
  const refresh = () => {
    if (Date.now() - last < MIN_GAP_MS) return;
    last = Date.now();
    void refreshRemoteFlags();
  };
  refresh();
  const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
  return () => sub.remove();
}, []);
```

Import `AppState` from `react-native` and `refreshRemoteFlags` from
`../lib/remoteFlags`.

- [ ] **Step 2: Verify end to end against production**

Flip a row and confirm the app follows without a rebuild:

```bash
# turn miniApps off
curl -s -X PATCH "$SUPABASE_URL/rest/v1/feature_flags?key=eq.miniApps" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -H 'Prefer: return=representation' \
  -d '{"enabled":false}'
```
Background the app, foreground it, confirm the Tools row disappears from the
You tab. Then set it back to `true` and confirm it returns.

- [ ] **Step 3: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(ops): refresh remote flags on launch and foreground"
```

---

### Task 5: Cron health that survives a job succeeding at nothing

**Files:**
- Create: `supabase/migrations/20260907091000_cron_health.sql`
- Modify: `.github/workflows/healthcheck.yml`

**Interfaces:**
- Produces: `public.cron_health()` returning `(unhealthy integer, detail text)`.

- [ ] **Step 1: Write the migration**

```sql
-- Cron monitoring that does not trust pg_cron alone.
--
-- cron.job_run_details records whether the scheduled SQL ran, not whether the
-- work happened. personalized-fanout reported 'succeeded' for weeks while doing
-- nothing, because its Vault secret was missing and the HTTP call it makes
-- failed downstream. So this checks both: the job ran recently, AND pg_net has
-- no recent failing response.
--
-- Returns a count and a short description rather than the rows themselves: it
-- is granted to anon so the healthcheck can call it with the publishable key,
-- and job names plus timings are all an unauthenticated caller should learn.
create or replace function public.cron_health()
returns table (unhealthy integer, detail text)
language sql
security definer
set search_path = public, cron, net
as $$
  with expected as (
    select * from (values
      ('daily-question-push',        interval '25 hours'),
      ('personalized-fanout',        interval '2 hours'),
      ('resweep-unmoderated-echoes', interval '90 minutes'),
      ('refresh_trending_echoes',    interval '15 minutes')
    ) as t(jobname, max_gap)
  ),
  last_run as (
    select j.jobname, max(d.end_time) as ran_at,
           max(d.end_time) filter (where d.status = 'succeeded') as ok_at
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
    where j.active
    group by j.jobname
  ),
  stale as (
    select e.jobname,
           case
             when l.ok_at is null then e.jobname || ': never succeeded'
             when now() - l.ok_at > e.max_gap then e.jobname || ': last success ' || age(now(), l.ok_at)
           end as problem
    from expected e
    left join last_run l on l.jobname = e.jobname
  ),
  http as (
    select count(*) as failures
    from net._http_response
    where created > now() - interval '2 hours'
      and (status_code is null or status_code >= 400)
  )
  select
    (select count(*) from stale where problem is not null)::int
      + (select case when failures > 0 then 1 else 0 end from http),
    coalesce(
      nullif(concat_ws('; ',
        (select string_agg(problem, '; ') from stale where problem is not null),
        (select case when failures > 0 then failures || ' failing pg_net responses in 2h' end from http)
      ), ''),
      'all scheduled jobs healthy')
$$;

revoke all on function public.cron_health() from public;
grant execute on function public.cron_health() to anon, authenticated;

comment on function public.cron_health() is
  'Scheduled-job health for the external healthcheck. Checks both that jobs ran and that pg_net calls succeeded — pg_cron reports success for a job that did nothing.';
```

- [ ] **Step 2: Apply and verify it returns healthy right now**

```bash
npx supabase db push
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/cron_health" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
```
Expected: `[{"unhealthy":0,"detail":"all scheduled jobs healthy"}]`. A non-zero
count right now means a real problem — investigate before continuing.

- [ ] **Step 3: Add the check to the healthcheck workflow**

After the "Ping an edge function" step in `.github/workflows/healthcheck.yml`:

```yaml
      - name: Check scheduled jobs
        id: crons
        env:
          EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
          EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_ANON_KEY }}
        run: |
          set -o pipefail
          if [ -z "$EXPO_PUBLIC_SUPABASE_URL" ]; then
            echo "ok=skipped" >> "$GITHUB_OUTPUT"; exit 0
          fi
          body=$(curl -s --max-time 20 -X POST \
            "${EXPO_PUBLIC_SUPABASE_URL%/}/rest/v1/rpc/cron_health" \
            -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
            -H 'Content-Type: application/json' -d '{}' || echo '')
          echo "cron_health -> $body"
          # One line on purpose: a multi-line python -c inside a YAML block
          # scalar dedents to column 0, which ends the block and makes YAML read
          # "try:" as a top-level key — it breaks the whole workflow file, not
          # just this step.
          n=$(printf '%s' "$body" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['unhealthy'])" 2>/dev/null || echo -1)
          if [ "$n" = "0" ]; then echo "ok=true" >> "$GITHUB_OUTPUT"
          else echo "ok=false" >> "$GITHUB_OUTPUT"; fi
```

Add `crons_ok: ${{ steps.crons.outputs.ok }}` to the job `outputs`, add
`|| needs.ping.outputs.crons_ok == 'false'` to the alert job's `if`, and add to
the summary builder:

```bash
          if [ "${{ steps.crons.outputs.ok }}" = "false" ]; then
            parts="${parts}- A scheduled job is stale or pg_net is failing — see cron_health()\n"
          fi
```

- [ ] **Step 4: Run it and confirm green**

Run: `gh workflow run healthcheck.yml && sleep 60 && gh run list --workflow=healthcheck.yml --limit 1`
Expected: success, and no new incident issue opened.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260907091000_cron_health.sql .github/workflows/healthcheck.yml
git commit -m "feat(ops): alert when a cron dies, including when it dies quietly"
```

---

### Task 6: Nightly database backup to R2

**Files:**
- Create: `.github/workflows/db-backup.yml`
- Modify: `docs/runbook/monitoring.md` (restore procedure)

**Interfaces:**
- Consumes: repository secrets `SUPABASE_DB_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Produces: `s3://echo-backups/db/echo-YYYY-MM-DD.sql.gz`, 30 days retained.

- [ ] **Step 1: Create the bucket and a scoped token**

In the Cloudflare dashboard: create the R2 bucket `echo-backups`, then an R2
API token scoped to **that bucket only**, with Object Read & Write. Store the
account id, access key id and secret as repository secrets. Store the Supabase
connection string (Project Settings → Database → Connection string, URI) as
`SUPABASE_DB_URL`.

That connection string is the most powerful secret in the repository. It is
here because a solo operator with no backup has no recovery, and that risk is
larger. Rotate it if the repository is ever made public.

- [ ] **Step 2: Write the workflow**

```yaml
name: Database Backup

# Supabase's own backups exist but are short-retention and tied to the account.
# This one is ours: if the account is lost, suspended, or a migration destroys
# data, this file is the recovery path. See docs/runbook/monitoring.md.

on:
  schedule:
    - cron: '15 20 * * *'   # 01:45 IST
  workflow_dispatch: {}

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - name: Install postgresql-client 17
        run: |
          sudo sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
          sudo apt-get update -qq
          sudo apt-get install -y -qq postgresql-client-17

      - name: Dump
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          if [ -z "$SUPABASE_DB_URL" ]; then
            echo "::error::SUPABASE_DB_URL is not set"; exit 1
          fi
          name="echo-$(date -u +%Y-%m-%d).sql.gz"
          # --no-owner/--no-acl so the dump restores into a fresh project whose
          # roles differ; that is the case we would actually be restoring into.
          pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl --clean --if-exists \
            | gzip -9 > "$name"
          size=$(stat -c%s "$name")
          echo "$name is $size bytes"
          # A dump that is suspiciously small is a failed dump that exited 0.
          if [ "$size" -lt 50000 ]; then
            echo "::error::dump is only $size bytes — treating as a failure"; exit 1
          fi
          echo "NAME=$name" >> "$GITHUB_ENV"

      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          ACCOUNT: ${{ secrets.R2_ACCOUNT_ID }}
        run: |
          set -euo pipefail
          endpoint="https://${ACCOUNT}.r2.cloudflarestorage.com"
          aws s3 cp "$NAME" "s3://echo-backups/db/$NAME" --endpoint-url "$endpoint"
          # Retention: 30 days. Deleting here rather than with a lifecycle rule
          # keeps the policy visible in the repo.
          cutoff=$(date -u -d '30 days ago' +%Y-%m-%d)
          aws s3 ls "s3://echo-backups/db/" --endpoint-url "$endpoint" \
            | awk '{print $4}' | while read -r f; do
              d=$(echo "$f" | sed -n 's/^echo-\([0-9-]\{10\}\)\.sql\.gz$/\1/p')
              if [ -n "$d" ] && [ "$d" \< "$cutoff" ]; then
                aws s3 rm "s3://echo-backups/db/$f" --endpoint-url "$endpoint"
              fi
            done

      - name: Open an issue if the backup failed
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner, repo: context.repo.repo,
              title: `Database backup failed — ${new Date().toISOString().slice(0,10)}`,
              labels: ['incident'],
              body: `The nightly dump did not complete.\n\nRun: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}\n\nRunbook: docs/runbook/monitoring.md`,
            });
```

- [ ] **Step 3: Run it once by hand and verify the artefact restores**

```bash
gh workflow run db-backup.yml
# after it completes, pull the file down and check it is a real dump
aws s3 cp "s3://echo-backups/db/echo-$(date -u +%Y-%m-%d).sql.gz" . \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
gunzip -c echo-*.sql.gz | head -40
gunzip -c echo-*.sql.gz | grep -c "CREATE TABLE"
```
Expected: readable SQL, and a CREATE TABLE count in the dozens. **A backup you
have not restored is a hypothesis, not a backup** — restore it into a local
`supabase start` database before calling this task done.

- [ ] **Step 4: Document the restore in the runbook**

Append to `docs/runbook/monitoring.md`:

```markdown
## Restoring the database

Backups are at `s3://echo-backups/db/echo-YYYY-MM-DD.sql.gz`, 30 days retained,
written nightly by `.github/workflows/db-backup.yml`.

    export ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
    aws s3 ls s3://echo-backups/db/ --endpoint-url "$ENDPOINT"
    aws s3 cp s3://echo-backups/db/echo-2026-09-07.sql.gz . --endpoint-url "$ENDPOINT"
    gunzip -c echo-2026-09-07.sql.gz | psql "$TARGET_DB_URL"

**The dump is taken with `--clean --if-exists`, so it DROPS existing objects
before recreating them.** Never point it at production to "merge" data — it
will delete what is there. Restore into a fresh project or a local
`supabase start` database, verify, then decide.

Restore into a local database at least once a quarter. A backup nobody has
restored is a hypothesis.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/db-backup.yml docs/runbook/monitoring.md
git commit -m "feat(ops): nightly database backup to R2, with a verified restore path"
```

---

### Task 7: Close the two store blockers

**Files:**
- Modify: `app.json` (android.permissions)
- Modify: `constants/legal/privacyPolicy.ts` (§2)

- [ ] **Step 1: Drop READ_CONTACTS and prove the contact card still works**

`plugins/withEchoContactCard.js` writes a contact through a sync adapter; that
needs `WRITE_CONTACTS`. Nothing in the app reads contacts — there is no
`expo-contacts` usage anywhere. Remove `android.permission.READ_CONTACTS` from
`android.permissions` in `app.json`, leaving `WRITE_CONTACTS`.

Run: `npx expo prebuild --platform android --clean`
Then: `grep -c READ_CONTACTS android/app/src/main/AndroidManifest.xml`
Expected: `0`. Build and confirm Echo still appears in the phone's address book.
If the sync adapter breaks without it, restore the permission and do Step 2
instead.

- [ ] **Step 2: Make §2 of the privacy policy true either way**

§2 currently says Echo does not collect contacts, while the manifest asks for
contacts permission — individually true, jointly unreadable. Replace the
sentence in `constants/legal/privacyPolicy.ts` with:

```
We do not collect precise GPS location, calendar, health data from Apple Health
or Google Fit, or advertising identifiers. We do not track you across other apps
or websites, and we do not buy data about you.

**Contacts.** On Android, Echo asks for permission to *write* one contact — its
own entry in your address book, so "Message on Echo" appears on a contact card.
It does not read your contacts, and no contact data ever leaves your device.
```

- [ ] **Step 3: Confirm the health-data disclosure is unambiguous**

§1 already lists body and health data from the mini-apps. The Data Safety form
must declare it under **Health and fitness → Health info, Fitness info**,
regardless of it not coming from a health API. No code change; this step exists
so the plan and the store form cannot drift.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm test
git add app.json constants/legal/privacyPolicy.ts
git commit -m "fix(privacy): stop asking to read contacts, and say what we do ask for"
```

---

## Not code — do these in parallel

Tracked here because they matter more than anything above, and none of them is
a task an engineer can execute.

- [ ] **Play closed test.** Create the closed track, recruit 12 testers, get them opted in. The 14-day clock starts on opt-in. This is the launch date.
- [ ] **Apple case 102951554733** — request a phone callback.
- [ ] **Connect Netlify** to the repo and set the five `EXPO_PUBLIC_*` build variables.
- [ ] **Rotate the Spotify secret** — after the edge function is deployed and an OTA has shipped, in that order, or music search breaks for installed builds.
- [ ] **Confirm Play App Signing** at first upload, then put the App signing SHA-256 into `ANDROID_CERT_SHA256` on Netlify. Without enrolment, a lost keystore means the app can never be updated again.
- [ ] **Repair the migration history** — five local migrations have no remote counterpart and five remote entries have no local file. `supabase migration repair --status applied <version>`. Do this before Task 1.
- [ ] **2FA backup codes** for Google, Apple, Expo, Supabase and Cloudflare, printed and stored offline.
- [ ] **Incorporate within 90 days of launch** — OPC or Pvt Ltd, via a CA/CS, roughly ₹10–15k. A sole proprietorship carries unlimited personal liability for everything users post. Both stores support app transfers, so launching first and incorporating after is viable; letting it run past the first hundred paying users is not.
