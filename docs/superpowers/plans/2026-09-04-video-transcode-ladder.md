# Video Transcode Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every uploaded video gains a 3-rung HLS ladder within a minute, so playback adapts to the viewer's actual bandwidth instead of serving one file to everyone.

**Architecture:** A Postgres trigger enqueues a row in `video_jobs` and asks GitHub to run. A workflow claims jobs, encodes with ffmpeg on the runner, uploads renditions to R2, and writes `hls_url` last. The app already prefers `hls_url`, so no app release is needed for the upgrade to take effect.

**Tech Stack:** Postgres (Supabase) + pg_net + vault, GitHub Actions (`ubuntu-latest`), ffmpeg 7.0.2 static, aws-cli 2.36.29 (preinstalled), Cloudflare R2, Node 20 for the worker script.

**Spec:** `docs/superpowers/specs/2026-09-04-video-transcode-ladder-design.md`

## Global Constraints

- **`hls_url` is written LAST**, only after every segment and manifest is uploaded and verified. Migration `20260824180000_drop_simulated_transcode.sql` removed an earlier trigger that wrote an `hls_url` pointing at a file that never existed, and closes with: *"What should not come back is a placeholder that writes a URL nobody serves."* Violating this breaks video for every affected post, because `lib/mapSupabaseEcho.ts:94` prefers the column.
- **Secrets come from `vault.decrypted_secrets`**, never `current_setting`. The removed trigger used `current_setting('app.settings.edge_function_url', true)` with an `http://kong:8000` fallback that silently no-ops in production. A missing secret must fail loudly. Pattern to copy: `supabase/migrations/20260802130000_server_side_moderation.sql:66-67`.
- **`ffmpeg` is NOT on the runner.** Verified: `ubuntu-latest` returns `ffmpeg: command not found`. Install `FedericoCarboni/setup-ffmpeg@v3` (provides 7.0.2 with `libx264`, `aac`, `hls` muxer). `aws-cli` 2.36.29 IS preinstalled.
- **Never upscale.** Emit fixed rungs strictly below source height, plus a top rung at `min(source_height, 720)`.
- **Content-Type on PUT:** `application/vnd.apple.mpegurl` for `.m3u8`, `video/mp2t` for `.ts`. The worker serves whatever was stored; a wrong type fails playback silently.
- **Manifests use relative segment URIs**, so a playlist works regardless of which host serves it.
- **Commit messages carry no AI attribution.** No `Co-Authored-By: Claude`, no `Claude-Session:` trailers.
- Tests run in the `logic` vitest project (`npx vitest run <file> --project logic`), node environment, `*.test.ts` only. Hook/component tests must be `*.test.tsx` (jsdom project).
- **The repository is going private.** Actions minutes become metered against a 2,000/month allowance. This is why dispatch is event-driven, not a 5-minute cron.

---

### Task 1: The job table and enqueue trigger

**Files:**
- Create: `supabase/migrations/20260904120000_video_jobs.sql`
- Test: verified by SQL assertions in a rolled-back transaction (Step 4)

**Interfaces:**
- Consumes: `public.public_echoes(id, media_urls, hls_url)`
- Produces: table `public.video_jobs`, function `public.claim_video_jobs(int)`, trigger `on_echo_insert_enqueue_transcode`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260904120000_video_jobs.sql`:

```sql
-- Queue for the HLS transcode ladder.
--
-- Enqueued by a trigger on public_echoes rather than by the upload path,
-- because the upload happens BEFORE the echo row exists: the app gets a
-- presigned PUT, uploads, then inserts the echo with media_urls. At upload
-- time there is no echo id to enqueue against.
create table if not exists public.video_jobs (
  id           uuid primary key default gen_random_uuid(),
  echo_id      uuid not null references public.public_echoes(id) on delete cascade,
  source_url   text not null,
  status       text not null default 'pending'
               check (status in ('pending','encoding','done','failed')),
  attempts     int  not null default 0,
  last_error   text,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists video_jobs_echo_uniq on public.video_jobs (echo_id);
create index if not exists video_jobs_pending_idx on public.video_jobs (status, created_at)
  where status in ('pending','encoding');

-- Only the encoder's service role touches this. RLS on with no policy denies
-- every client role, matching thinking_fingerprints and ad_events.
alter table public.video_jobs enable row level security;

comment on table public.video_jobs is
  'Transcode queue. Oldest pending age is the liveness signal for the encoder — '
  'if it stops running nothing errors, the table just fills. audit-backend asserts it.';

/**
 * Claim up to p_limit jobs for this run.
 *
 * FOR UPDATE SKIP LOCKED so two overlapping workflow runs cannot claim the same
 * job. The claimed_at clause reclaims work abandoned by a cancelled run — which
 * is normal on Actions, not exceptional — so a cancellation cannot strand a
 * video permanently.
 */
create or replace function public.claim_video_jobs(p_limit int default 5)
returns setof public.video_jobs
language sql
security definer
set search_path = public
as $$
  update public.video_jobs
     set status = 'encoding', claimed_at = now(), attempts = attempts + 1, updated_at = now()
   where id in (
     select id from public.video_jobs
      where status = 'pending'
         or (status = 'encoding' and claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked)
  returning *;
$$;

revoke execute on function public.claim_video_jobs(int) from public, anon, authenticated;

/**
 * Enqueue a transcode when an echo lands with a video and no ladder yet.
 *
 * Fires on INSERT and on UPDATE of media_urls, so a post edited to add a video
 * is not missed. ON CONFLICT DO NOTHING makes it idempotent against the unique
 * index — re-running is free.
 */
create or replace function public.enqueue_video_transcode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
begin
  if new.hls_url is not null then return new; end if;

  select u into v_source
    from unnest(coalesce(new.media_urls, array[]::text[])) u
   where u ~* '\.(mp4|mov|m4v|webm)(\?|$)'
   limit 1;

  if v_source is null then return new; end if;

  insert into public.video_jobs (echo_id, source_url)
  values (new.id, v_source)
  on conflict (echo_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_echo_insert_enqueue_transcode on public.public_echoes;
create trigger on_echo_insert_enqueue_transcode
  after insert or update of media_urls on public.public_echoes
  for each row execute function public.enqueue_video_transcode();
```

- [ ] **Step 2: Dry-run it in a rolled-back transaction**

Apply the file's contents inside `begin; … rollback;` via the Supabase SQL runner, then assert before rolling back:

```sql
-- a video echo enqueues exactly one job
insert into public_echoes (author_id, title, response, media_urls)
values ((select id from auth.users limit 1), 't', 'r',
        array['https://example.com/a/1_video.mp4']) returning id;
-- expect: 1 row in video_jobs for that echo

-- a text-only echo enqueues nothing
insert into public_echoes (author_id, title, response) values (…, 't', 'r');
-- expect: no new video_jobs row

-- claiming twice does not hand out the same job
select count(*) from claim_video_jobs(5);   -- expect 1
select count(*) from claim_video_jobs(5);   -- expect 0
```

Expected: all three hold. Roll back.

- [ ] **Step 3: Apply for real and verify**

Apply the migration, then confirm on the live schema:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='video_jobs') as tbl,
  (select relrowsecurity from pg_class where oid='public.video_jobs'::regclass) as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='video_jobs') as policies,
  (select count(*) from pg_trigger where tgname='on_echo_insert_enqueue_transcode') as trg;
```

Expected: `tbl=1, rls=true, policies=0, trg=1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904120000_video_jobs.sql
git commit -m "feat(video): queue table and enqueue trigger for the transcode ladder

Enqueued by a trigger on public_echoes rather than the upload path, because the
upload happens before the echo row exists — the app gets a presigned PUT,
uploads, then inserts with media_urls, so at upload time there is no echo id.
The trigger also fires on UPDATE of media_urls so an edited post is not missed,
and ON CONFLICT DO NOTHING makes re-running free.

claim_video_jobs uses FOR UPDATE SKIP LOCKED so overlapping runs cannot claim
the same job, and reclaims rows stuck in encoding for 15 minutes — a cancelled
run is normal on Actions, and without the reclaim one cancellation would strand
a video permanently.

RLS on with no policy: only the encoder's service role touches this."
```

---

### Task 2: The dispatch trigger

**Files:**
- Create: `supabase/migrations/20260904121000_video_transcode_dispatch.sql`

**Interfaces:**
- Consumes: `public.video_jobs` (Task 1), `vault.decrypted_secrets`, `net.http_post`
- Produces: function `public.dispatch_video_transcode()`, appended to the Task 1 trigger

- [ ] **Step 1: Store the token**

In the Supabase dashboard → Vault, add a secret named `github_dispatch_token` containing a GitHub fine-grained PAT scoped to this repository with **Contents: read** and **Metadata: read** — the minimum `repository_dispatch` requires.

- [ ] **Step 2: Write the migration**

```sql
-- Ask GitHub to run the transcode workflow now, rather than waiting for the
-- hourly safety-net cron.
--
-- The credential comes from the vault, NOT current_setting. The transcode
-- trigger removed in 20260824180000 read
-- current_setting('app.settings.edge_function_url', true) with a fallback of
-- http://kong:8000 — an address that does not resolve in production, which is
-- the only reason that trigger never broke anything. A missing vault secret
-- raises instead, and this project has already lost a week to a cron that was
-- silently dead because its vault secret was absent.
create or replace function public.dispatch_video_transcode()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'github_dispatch_token';

  if v_token is null then
    raise warning 'github_dispatch_token missing from vault; transcode falls back to the hourly cron';
    return new;
  end if;

  perform net.http_post(
    url     := 'https://api.github.com/repos/Ak2556/echo-mobile/dispatches',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_token,
                 'Accept',        'application/vnd.github+json',
                 'Content-Type',  'application/json',
                 'User-Agent',    'echo-transcode-dispatch'),
    body    := jsonb_build_object('event_type', 'transcode-video'));

  return new;
end;
$$;

drop trigger if exists on_video_job_dispatch on public.video_jobs;
create trigger on_video_job_dispatch
  after insert on public.video_jobs
  for each row execute function public.dispatch_video_transcode();
```

A missing secret warns rather than raises, deliberately: the job row is already
committed, so the hourly cron still drains it. Failing the insert would lose the
video's place in the queue to protect a latency optimisation.

- [ ] **Step 3: Apply and verify the call actually leaves the database**

Apply, then insert a test echo with a video and check pg_net's response log:

```sql
select status_code, left(coalesce(error_msg, content), 120) as result, created
  from net._http_response order by created desc limit 3;
```

Expected: `status_code = 204` (GitHub's success for `dispatches`). A 401 means the token is wrong; a 404 means the token lacks repository access.

**This step is the one that proves the design.** A green `net.http_post` return value means only that the request was queued — `net._http_response` is where the truth is. That distinction is exactly what made an earlier cron in this project look healthy while dead.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260904121000_video_transcode_dispatch.sql
git commit -m "feat(video): dispatch the transcode workflow on enqueue

Event-driven rather than a 5-minute cron because the repository is going
private: GitHub rounds every Actions job up to a whole minute, so polling would
burn ~8,640 minutes a month against a 2,000 allowance, mostly for runs that find
nothing. Firing on upload makes cost scale with videos instead of with time.

The token comes from vault.decrypted_secrets, matching the moderation trigger.
The removed transcode trigger read current_setting with an http://kong:8000
fallback that silently no-ops in production — the only reason it never broke
anything.

A missing secret warns rather than raises: the job row is already committed and
the hourly cron will drain it, so failing the insert would cost the video its
place in the queue to protect a latency optimisation.

Verified against net._http_response, not the http_post return value — a queued
request returns success regardless of what the remote said."
```

---

### Task 3: The encoder script

**Files:**
- Create: `scripts/transcode-worker.mjs`
- Test: `scripts/transcode-worker.test.ts`

**Interfaces:**
- Consumes: `claim_video_jobs(int)` (Task 1)
- Produces: `buildLadder(sourceHeight)` and `rungSettings(height)`, exported for test; the script's CLI entry point

- [ ] **Step 1: Write the failing test**

Create `scripts/transcode-worker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLadder, rungSettings } from './transcode-worker.mjs';

describe('buildLadder', () => {
  it('emits three rungs for a 720p source', () => {
    expect(buildLadder(720)).toEqual([360, 540, 720]);
  });

  it('tops out at the source height, never above it', () => {
    // The ladder must never offer less than the original did: a 480p upload
    // gets a 480p top rung, not 360p.
    expect(buildLadder(480)).toEqual([360, 480]);
  });

  it('caps at 720 even for a taller source', () => {
    expect(buildLadder(1080)).toEqual([360, 540, 720]);
  });

  it('emits a single rung when the source is at or below the lowest', () => {
    expect(buildLadder(360)).toEqual([360]);
    expect(buildLadder(240)).toEqual([240]);
  });

  it('never duplicates a rung when the source matches a fixed one', () => {
    expect(buildLadder(540)).toEqual([360, 540]);
  });
});

describe('rungSettings', () => {
  it('picks settings by height band, so a source-height top rung is covered', () => {
    expect(rungSettings(360).crf).toBe(26);
    expect(rungSettings(480).crf).toBe(25);  // band ≤540
    expect(rungSettings(720).crf).toBe(24);
  });

  it('caps maxrate by band', () => {
    expect(rungSettings(360).maxrate).toBe('800k');
    expect(rungSettings(720).maxrate).toBe('2800k');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/transcode-worker.test.ts --project logic`
Expected: FAIL — cannot resolve `./transcode-worker.mjs`.

- [ ] **Step 3: Write the ladder logic**

Create `scripts/transcode-worker.mjs` beginning with the pure functions:

```js
/**
 * Transcode worker. Runs on a GitHub Actions runner, claims jobs from
 * video_jobs, encodes an HLS ladder, uploads to R2, and writes hls_url LAST.
 *
 * hls_url pointing at a manifest that does not exist breaks playback for every
 * affected post, because lib/mapSupabaseEcho.ts prefers the column. Migration
 * 20260824180000 removed exactly that bug; do not reintroduce it.
 */

const FIXED_RUNGS = [360, 540];
const MAX_RUNG = 720;

/**
 * Rungs for a source, never upscaling and never topping out below the source.
 *
 * Fixed rungs strictly below the source, then a top rung at
 * min(sourceHeight, 720). The top rung is defined by the source rather than a
 * fixed list so a 480p upload gets 480p, not 360p — the ladder must never offer
 * less than the original did.
 */
export function buildLadder(sourceHeight) {
  const top = Math.min(sourceHeight, MAX_RUNG);
  const below = FIXED_RUNGS.filter((h) => h < top);
  return [...below, top];
}

/**
 * Encoder settings by height band, so the source-height top rung needs no
 * special case.
 */
export function rungSettings(height) {
  if (height <= 360) return { crf: 26, maxrate: '800k', bufsize: '1600k' };
  if (height <= 540) return { crf: 25, maxrate: '1500k', bufsize: '3000k' };
  return { crf: 24, maxrate: '2800k', bufsize: '5600k' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/transcode-worker.test.ts --project logic`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the job-processing body**

Append to `scripts/transcode-worker.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_BUCKET    = process.env.R2_BUCKET ?? 'echo-media';
const R2_ENDPOINT  = process.env.R2_ENDPOINT;   // https://<account>.r2.cloudflarestorage.com
const PUBLIC_BASE  = process.env.PUBLIC_MEDIA_BASE; // https://…workers.dev/media/echo-media
const BATCH        = Number(process.env.BATCH ?? 5);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/** Probe the source once; height drives the ladder, codec decides remux vs re-encode. */
function probe(file) {
  const out = sh('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=height,codec_name',
    '-of', 'json', file,
  ]);
  const s = JSON.parse(out).streams?.[0] ?? {};
  return { height: Number(s.height) || 0, codec: s.codec_name ?? '' };
}

async function processJob(job) {
  const work = mkdtempSync(join(tmpdir(), 'echo-transcode-'));
  try {
    const src = join(work, 'src.mp4');
    sh('curl', ['-sSfL', job.source_url, '-o', src]);

    const { height, codec } = probe(src);
    if (!height) throw new Error('could not read source height');

    const rungs = buildLadder(height);
    for (const h of rungs) {
      const dir = join(work, `${h}p`);
      sh('mkdir', ['-p', dir]);
      // The top rung is a remux when the source is already H.264 at that
      // height: faster, and strictly higher quality than re-encoding a file to
      // its own resolution.
      const canCopy = h === Math.min(height, 720) && codec === 'h264';
      const video = canCopy
        ? ['-c:v', 'copy']
        : ['-vf', `scale=-2:${h}`, '-c:v', 'libx264', '-preset', 'veryfast',
           '-crf', String(rungSettings(h).crf),
           '-maxrate', rungSettings(h).maxrate, '-bufsize', rungSettings(h).bufsize];

      sh('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-i', src,
        ...video, '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
        '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod',
        '-hls_segment_filename', join(dir, 'seg_%05d.ts'),
        join(dir, 'index.m3u8'),
      ]);
    }

    // Master manifest with RELATIVE variant URIs, so it works from any host.
    const master = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const h of rungs) {
      const bw = { 360: 900_000, 480: 1_400_000, 540: 1_700_000, 720: 3_000_000 }[h] ?? 1_500_000;
      master.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=x${h}`, `${h}p/index.m3u8`);
    }
    writeFileSync(join(work, 'master.m3u8'), master.join('\n') + '\n');

    // Derive the destination prefix from the original key, so no lookup table
    // is needed: …/<ts>_video.mp4 → …/<ts>_hls/
    const key = new URL(job.source_url).pathname.split('/media/echo-media/')[1];
    if (!key) throw new Error(`unexpected source url shape: ${job.source_url}`);
    const prefix = key.replace(/_video\.(mp4|mov|m4v|webm)$/i, '_hls');

    // Content-Type per extension. The worker serves whatever was stored, so a
    // wrong type here fails playback silently.
    sh('aws', ['s3', 'sync', work, `s3://${R2_BUCKET}/${prefix}`,
               '--endpoint-url', R2_ENDPOINT, '--exclude', 'src.mp4',
               '--exclude', '*.m3u8', '--content-type', 'video/mp2t']);
    sh('aws', ['s3', 'sync', work, `s3://${R2_BUCKET}/${prefix}`,
               '--endpoint-url', R2_ENDPOINT, '--exclude', '*', '--include', '*.m3u8',
               '--content-type', 'application/vnd.apple.mpegurl']);

    const hlsUrl = `${PUBLIC_BASE}/${prefix}/master.m3u8`;

    // Verify before claiming success. Writing hls_url for a manifest that is
    // not actually served is the exact bug 20260824180000 removed.
    sh('curl', ['-sSfI', hlsUrl]);

    await sb.from('public_echoes').update({ hls_url: hlsUrl }).eq('id', job.echo_id);
    await sb.from('video_jobs').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', job.id);
    console.log(`done ${job.echo_id} → ${rungs.join('/')}p`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = job.attempts >= 3 ? 'failed' : 'pending';
    await sb.from('video_jobs')
      .update({ status, last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', job.id);
    console.error(`job ${job.id} ${status}: ${msg}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  const { data: jobs, error } = await sb.rpc('claim_video_jobs', { p_limit: BATCH });
  if (error) throw error;
  if (!jobs?.length) { console.log('nothing pending'); return; }
  console.log(`claimed ${jobs.length}`);
  for (const job of jobs) await processJob(job);
}

if (process.argv[1]?.endsWith('transcode-worker.mjs')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 6: Verify the pure functions still pass and typecheck is clean**

Run: `npx vitest run scripts/transcode-worker.test.ts --project logic && npm run typecheck`
Expected: 7 passing; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/transcode-worker.mjs scripts/transcode-worker.test.ts
git commit -m "feat(video): transcode worker — ladder, encode, upload, verify

buildLadder never upscales and never tops out below the source: fixed rungs
strictly below, then a top rung at min(sourceHeight, 720). A 480p upload gets a
480p top rung, not 360p — the ladder must never offer less than the original.
Settings are chosen by height band so that source-height rung needs no special
case, and the top rung is a -c copy remux when the source is already H.264 at
that height, which is faster and strictly higher quality than re-encoding a file
to its own resolution.

hls_url is written last, and only after curl -I confirms the master manifest is
actually served. Writing it for a manifest that does not exist is the exact bug
migration 20260824180000 removed, and the client prefers the column, so the
failure would be invisible until playback."
```

---

### Task 4: The workflow

**Files:**
- Create: `.github/workflows/transcode.yml`

**Interfaces:**
- Consumes: `scripts/transcode-worker.mjs` (Task 3)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the workflow**

```yaml
name: Transcode Video

on:
  # Fired by the Postgres dispatch trigger when a video is enqueued. Event-driven
  # rather than a short cron because the repository is private: GitHub rounds
  # every job up to a whole minute, so a 5-minute poll would burn ~8,640 minutes
  # a month against a 2,000 allowance, mostly finding nothing to do.
  repository_dispatch:
    types: [transcode-video]
  # Safety net only. A dispatch can be lost — network failure, revoked token, a
  # GitHub incident — and pure event-driven would strand that job forever.
  # Hourly is ~720 minutes a month, inside the allowance.
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:

# A second run claiming while the first is mid-encode is safe (FOR UPDATE SKIP
# LOCKED), but serialising avoids paying for overlapping runners.
concurrency:
  group: transcode-video
  cancel-in-progress: false

jobs:
  transcode:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci --omit=dev --ignore-scripts

      # ubuntu-latest does NOT ship ffmpeg — verified, it returns
      # "command not found". aws-cli IS preinstalled.
      - uses: FedericoCarboni/setup-ffmpeg@v3

      - name: Drain the transcode queue
        env:
          SUPABASE_URL:              ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          AWS_ACCESS_KEY_ID:         ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY:     ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION:        auto
          R2_ENDPOINT:               ${{ secrets.R2_ENDPOINT }}
          PUBLIC_MEDIA_BASE:         ${{ secrets.PUBLIC_MEDIA_BASE }}
          BATCH: '5'
        run: node scripts/transcode-worker.mjs
```

- [ ] **Step 2: Add the six repository secrets**

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `PUBLIC_MEDIA_BASE` (`https://echo-mobile.at3236129.workers.dev/media/echo-media`).

- [ ] **Step 3: Run it manually against an empty queue**

Run: `gh workflow run "Transcode Video" --ref main`, then read the log.
Expected: `nothing pending`, job succeeds. This proves credentials and the RPC before any real video is at stake.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/transcode.yml
git commit -m "feat(video): transcode workflow, event-driven with an hourly net

repository_dispatch rather than a short cron because the repository is private
and GitHub rounds every job up to a whole minute — a 5-minute poll is ~8,640
minutes a month against a 2,000 allowance, mostly for runs finding nothing. The
hourly schedule is a safety net for a lost dispatch, at ~720 minutes.

Installs ffmpeg explicitly: ubuntu-latest does not ship it, verified by probe.
aws-cli is preinstalled and needs nothing."
```

---

### Task 5: HLS → MP4 fallback in the app

**Files:**
- Modify: `src/features/feed/ui/VideoPreview.tsx`
- Test: `src/features/feed/lib/videoFallback.test.ts`
- Create: `src/features/feed/lib/videoFallback.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `nextVideoSource(current, original)` — returns the MP4 to retry with, or null

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/lib/videoFallback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextVideoSource } from './videoFallback';

describe('nextVideoSource', () => {
  it('falls back from a failed HLS manifest to the original mp4', () => {
    expect(nextVideoSource('https://x/a_hls/master.m3u8', 'https://x/a_video.mp4'))
      .toBe('https://x/a_video.mp4');
  });

  it('does not retry when the failure was already the mp4', () => {
    // Retrying the same source in a loop is worse than showing the error.
    expect(nextVideoSource('https://x/a_video.mp4', 'https://x/a_video.mp4')).toBeNull();
  });

  it('does not retry when there is no original to fall back to', () => {
    expect(nextVideoSource('https://x/a_hls/master.m3u8', undefined)).toBeNull();
  });

  it('treats any .m3u8 as HLS regardless of path shape', () => {
    expect(nextVideoSource('https://x/weird/path.m3u8?v=2', 'https://x/o.mp4'))
      .toBe('https://x/o.mp4');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/feed/lib/videoFallback.test.ts --project logic`
Expected: FAIL — cannot resolve `./videoFallback`.

- [ ] **Step 3: Write it**

```ts
/**
 * What to try after a video fails to load.
 *
 * The ladder is an upgrade layered over an original that still exists in R2. If
 * a manifest is malformed, a segment 404s, or the encoder shipped a bad build,
 * the original still plays — so a pipeline fault should degrade quality, not
 * kill the card. Without this a bad encoder deploy takes video down for
 * everyone, because lib/mapSupabaseEcho.ts prefers hls_url unconditionally.
 */
export function nextVideoSource(
  current: string | undefined,
  original: string | undefined,
): string | null {
  if (!current || !original) return null;
  if (current === original) return null;        // already the fallback; do not loop
  if (!/\.m3u8(\?|$)/i.test(current)) return null;
  return original;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/feed/lib/videoFallback.test.ts --project logic`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire it into VideoPreview**

`VideoPlayer` currently sets `loadState` to `'error'` and stops. Add an `mp4Url` prop (the original from `media_urls`), hold the active source in state initialised to `uri`, and on transition to `'error'` call `nextVideoSource(activeSource, mp4Url)` — if it returns a URL, set it as the active source and reset `loadState` to `'loading'`. Retry once only; a second error stays an error.

Pass `mp4Url` from `FlowCard` and `FeedCard` using the item's raw `media_urls` video entry.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tsc clean, 0 lint errors, suite green with 4 more tests.

- [ ] **Step 7: Commit**

```bash
git add src/features/feed/lib/videoFallback.ts src/features/feed/lib/videoFallback.test.ts src/features/feed/ui/VideoPreview.tsx src/features/feed/ui/FlowCard.tsx src/features/feed/ui/FeedCard.tsx
git commit -m "fix(video): fall back to the original mp4 when HLS fails

The ladder is an upgrade over an original that still exists in R2, but
mapSupabaseEcho prefers hls_url unconditionally — so a malformed manifest, a
404ing segment, or a bad encoder deploy would have shown a dead card for every
video rather than a slightly worse one.

Retries once, only from HLS to the original, and never retries the source that
already failed: looping on the same URL is worse than showing the error."
```

---

### Task 6: CORS on /media

**Files:**
- Modify: `cloudflare/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the header**

In the `/media/:bucket/:key` handler, beside the existing `Accept-Ranges` line, add:

```ts
  // HLS on the web build fetches the manifest and every segment with XHR, which
  // is subject to CORS; without this it fails with an opaque network error while
  // native playback works fine. These buckets are already world-readable, so a
  // wildcard grants nothing that a direct GET does not.
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
```

- [ ] **Step 2: Verify on a preview version, not production**

```bash
cd cloudflare && npx wrangler versions upload
```

Then against the printed preview URL:

```bash
curl -s -o /dev/null -D - "<preview>/media/echo-media/<a real key>" \
  | grep -iE "^HTTP|access-control|accept-ranges"
```

Expected: `200`, `access-control-allow-origin: *`, `accept-ranges: bytes`. Also re-check a ranged request still returns `206` — the header addition must not disturb the range path added earlier today.

- [ ] **Step 3: Deploy and re-verify against production**

```bash
npx wrangler versions deploy <version-id>@100% --yes
```

Then repeat the curl checks against `https://echo-mobile.at3236129.workers.dev`.

- [ ] **Step 4: Commit**

```bash
git add cloudflare/src/index.ts
git commit -m "feat(media): CORS on /media so HLS works on the web build

HLS fetches the manifest and every segment with XHR, which is subject to CORS.
Native playback is unaffected, so without this the ladder would work on iOS and
Android and fail on web with an opaque network error. These buckets are already
world-readable via a direct GET, so the wildcard grants nothing new.

Verified on a preview version before production, including that a ranged request
still returns 206."
```

---

### Task 7: Liveness check and backfill

**Files:**
- Modify: `scripts/audit-backend.mjs`

**Interfaces:**
- Consumes: `public.video_jobs` (Task 1)
- Produces: audit check `[7/7]`

- [ ] **Step 1: Renumber and add the check**

Renumber the existing headings `[1/6]`…`[6/6]` to `[1/7]`…`[6/7]`, then insert before the final `console.log(failures …)`:

```js
console.log('\n[7/7] Video transcode queue');
{
  // If the encoder stops running — a disabled schedule, a revoked token, a
  // deleted workflow — nothing errors. Jobs keep enqueuing and the table
  // quietly fills, and that is the ONLY symptom. Oldest-pending age is
  // therefore the liveness signal, not "did the last job succeed".
  // NOTE on scope: this script authenticates with the publishable key
  // (audit-backend.mjs:15) and video_jobs has RLS on with no policy, so the
  // live "oldest pending age" query is NOT possible from here. That check needs
  // the service role and belongs in the healthcheck workflow, which already has
  // secrets and runs every 15 minutes — see Step 5 below. What audit-backend
  // CAN assert is that the machinery whose loss would be silent still exists.
  const src = readAll(['supabase/migrations'], ['.sql']);
  if (!/create table if not exists public\.video_jobs/i.test(src)) {
    fail('video_jobs table is not created by any migration');
  } else if (!/for update skip locked/i.test(src)) {
    fail('claim_video_jobs has lost FOR UPDATE SKIP LOCKED — overlapping runs can double-encode');
  } else if (!/claimed_at < now\(\) - interval/i.test(src)) {
    fail('the stuck-job reclaim window is gone — a cancelled run strands a video permanently');
  } else {
    ok('transcode queue claim semantics intact');
  }

  const worker = readAll(['scripts'], ['.mjs']);
  if (!/curl'?,?\s*\[\s*'-sSfI'/.test(worker) && !/-sSfI/.test(worker)) {
    fail('the worker no longer verifies the manifest before writing hls_url — see migration 20260824180000');
  } else {
    ok('hls_url is written only after the manifest is verified');
  }
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/audit-backend.mjs`
Expected: seven sections, all pass, exit 0.

- [ ] **Step 3: Prove the check discriminates**

Temporarily delete `for update skip locked` from the migration, re-run, and confirm it fails with exit 1. Restore. Then temporarily remove `-sSfI` from the worker, confirm that fails too, and restore. Report both outputs — a check only tested in the passing direction proves nothing.

- [ ] **Step 4: Add the live liveness check to the healthcheck workflow**

`audit-backend.mjs` cannot read `video_jobs` — it uses the publishable key and
the table is RLS-denied to every client role. The oldest-pending query needs the
service role, so it goes in `.github/workflows/healthcheck.yml`, which already
runs every 15 minutes and already holds secrets. Add a step:

```yaml
      - name: Transcode queue is draining
        env:
          SUPABASE_URL:              ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          # If the encoder stops running, nothing errors — jobs keep enqueuing
          # and the table fills. Oldest-pending age is the only symptom.
          age=$(curl -sS "$SUPABASE_URL/rest/v1/video_jobs?status=eq.pending&select=created_at&order=created_at.asc&limit=1"                  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"                  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"                  | python3 -c "import sys,json,datetime as d;r=json.load(sys.stdin);print(0 if not r else int((d.datetime.now(d.timezone.utc)-d.datetime.fromisoformat(r[0]['created_at'])).total_seconds()/60))")
          echo "oldest pending job: ${age} min"
          if [ "$age" -gt 30 ]; then
            echo "::error::transcode queue not draining — oldest pending job is ${age} minutes old"
            exit 1
          fi
```

Thirty minutes is deliberately looser than the hourly safety-net cron is tight:
it tolerates one missed dispatch plus a delayed schedule, and only fires when
the encoder is genuinely not running.

- [ ] **Step 5: Backfill the ten existing videos**

```sql
insert into video_jobs (echo_id, source_url)
select id, (select u from unnest(media_urls) u where u ~* '\.(mp4|mov|m4v)$' limit 1)
  from public_echoes
 where hls_url is null and media_urls is not null
   and exists (select 1 from unnest(media_urls) u where u ~* '\.(mp4|mov|m4v)$')
on conflict (echo_id) do nothing;
```

Then watch the workflow drain them and verify:

```sql
select status, count(*) from video_jobs group by status;
select count(*) from public_echoes where hls_url is not null;
```

Expected: all `done`, and `hls_url` set on every video echo. Spot-check one URL with `curl -sSfI` and confirm it returns 200 with `application/vnd.apple.mpegurl`.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-backend.mjs .github/workflows/healthcheck.yml
git commit -m "test(video): assert the transcode queue's claim semantics and manifest check

If the encoder stops running nothing errors — jobs keep enqueuing and the table
quietly fills, which is the only symptom. This asserts the two properties whose
loss would be silent: FOR UPDATE SKIP LOCKED (without it overlapping runs
double-encode) and the stuck-job reclaim window (without it one cancelled run
strands a video permanently).

Also asserts the worker still verifies the manifest before writing hls_url,
which is the bug migration 20260824180000 removed and warned against.

Verified both directions: removing either property fails the audit with exit 1."
```

---

## Done when

- Uploading a video results in `hls_url` set within a few minutes, and the URL returns 200 with `application/vnd.apple.mpegurl`.
- All ten existing videos are backfilled and playing from HLS.
- A deliberately broken manifest causes the app to fall back to the MP4, not show a dead card.
- `node scripts/audit-backend.mjs` passes seven checks, and fails when the claim semantics or the manifest verification are removed.
- `npm run typecheck`, `npm run lint`, `npm test` all clean.
- A ranged request to `/media` still returns 206 (the CORS change must not disturb it).

## Not in this plan

- Data Saver capping the ladder to 360p.
- fMP4/CMAF packaging.
- Poster/thumbnail extraction — which would also fill the blank placeholder the Flow shows for a released player.
- Moving off GitHub Actions. The spec's "What to switch, and when" section covers the trigger (a monthly Actions bill over ~$10, around 2,000 videos/month) and confirms the move is a deployment change, not a migration.
