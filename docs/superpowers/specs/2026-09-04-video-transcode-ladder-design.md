# Video transcode ladder — design

**Date:** 2026-09-04
**Status:** approved design, not yet implemented
**Scope:** an HLS adaptive ladder for feed video, encoded on GitHub Actions at zero compute cost; no change to the upload path, and almost none to the app

## Purpose

Every device is served the same video file. A 4-year-old budget Android on a
2G connection downloads the identical bytes as a flagship on wifi, and there is
no way for either to adapt while playing. This adds three renditions and an HLS
manifest per video so the player picks a rung by actual bandwidth and can
change rung mid-stream.

The constraint that shapes everything: the audience is India-first, where
network variability matters more than device capability. A user whose signal
degrades mid-video should downshift, not stall.

## Context: what exists today

- **Upload** goes straight to R2. The app asks the worker for a presigned PUT
  (`/upload-url`, `cloudflare/src/index.ts:355`) and uploads directly. Nothing
  processes the file. `Content-Type` is set correctly on upload — a served
  object reports `video/mp4`.
- **Videos are capped at 60 seconds** (`app/create-post.tsx:56`) and at
  `IFrame1280x720` on iOS / `Medium` on Android (`:290-292`). Android's Medium
  is device-dependent and is often 480p.
- **The app side is already built and unused.** `public_echoes.hls_url` exists,
  `lib/mapSupabaseEcho.ts:94` already prefers it
  (`echo.hls_url ?? mediaUris.find(isVideoUri)`), `lib/videoMedia.ts:19` already
  maps `.m3u8` to `contentType: 'hls'`, and `components/media/HlsVideoPlayer.tsx`
  exists. **0 of 10 videos have `hls_url` set** and nothing in the codebase ever
  writes it.
- **Byte ranges now work.** Added 2026-09-04; the worker previously answered a
  range request with the whole object. This is why progressive publishing is
  acceptable: an un-laddered video already starts quickly.
- **The worker sets no CORS headers on `/media`.** Native playback does not care;
  web does, and HLS on the web build will fail opaquely without it.
- **Player concurrency was fixed separately** (2026-09-04): the Flow releases
  inactive players, the home feed caps `drawDistance`.

## Decisions taken, and why

**Self-hosted encoder over Cloudflare Stream.** R2 has zero egress fees. At
10,000 videos viewed 100 times each, Stream's per-delivered-minute pricing is
roughly $1,000/month against roughly $1 for R2 storage. For a high-view,
low-revenue-per-user audience that is the wrong shape of bill, and this project
is already constrained by cost elsewhere.

**GitHub Actions over a Fly/Railway container.** The container was the original
choice at roughly $5-10/month; the requirement changed to zero initial cost.
This repository is public, so Actions minutes on standard runners are free and
unmetered, and there is no new service to operate — which for a solo maintainer
is worth as much as the money.

**Event-driven, not scheduled — because the repository will be private.** This
is the decision that changed when privacy was confirmed. GitHub bills Actions on
private repositories against a 2,000 minute monthly allowance and rounds every
job up to a whole minute. A five-minute cron is 8,640 runs a month, so it would
consume roughly 8,640 minutes — about $53/month — mostly for runs that find
nothing to do. That is worse than the container this design rejected.

Firing only when a video actually arrives inverts that: cost scales with
uploads rather than with time.

    echo row inserted (trigger) → net.http_post → GitHub repository_dispatch
                                → workflow runs only when there is work

    10 videos/day    ~300 min/mo     $0
    60 videos/day  ~1,800 min/mo     $0
   100 videos/day  ~3,000 min/mo    ~$8
 1,000 videos/day ~30,000 min/mo  ~$224

**A low-frequency cron remains, as a safety net only.** A dispatch can be lost —
a network failure, a revoked token, a GitHub incident — and pure event-driven
would leave that job pending forever with nothing to retry it. An hourly
schedule (about 720 minutes a month, inside the allowance) drains anything the
dispatch missed. Latency for the normal path stays seconds-to-a-minute; the
cron exists for the abnormal one.

Latency is the cost either way, and it is acceptable only because publishing is
progressive: the echo appears immediately and plays the original, which now
starts quickly because byte ranges shipped the same day. The ladder is an
upgrade that lands later, never a gate on the post appearing.

Two properties of scheduled workflows shape the safety net: schedules are
disabled automatically after 60 days without repository activity, and a run can
be skipped when GitHub is busy. Neither is detectable from inside the workflow,
which is why the liveness check lives in Postgres and measures oldest-pending
age rather than trusting the job to report on itself.

**HLS ladder over tier-selected MP4s.** Tier-selected MP4s are simpler and
would reuse the range support already shipped, but the choice is made once at
load. Device tier is a poor proxy for network quality — a flagship on 2G gets
720p — and a commuter whose signal degrades cannot downshift. HLS is also what
the schema and player were already built for; the alternative would leave
`hls_url` dead and add a parallel mechanism beside it.

**Postgres job table over a direct HTTP call or Cloudflare Queues.** A dropped
HTTP call leaves a video that should have been encoded with no record that it
should have been — the exact failure class this codebase keeps hitting. Queues
are purpose-built but keep job state outside Postgres, where the existing
"is it actually running?" checks cannot see it.

**Enqueue from a Postgres trigger, not from the worker.** The upload happens
*before* the echo row exists — the app gets a presigned PUT, uploads, then
creates the echo with `media_urls` — so at upload time there is no echo id to
enqueue against. A trigger on `public_echoes` needs no change to the upload
path, cannot miss a video, and makes backfill a single INSERT…SELECT.

## The dispatch trigger

The same trigger that enqueues the job also asks GitHub to run. It follows the
pattern already working in `20260802130000_server_side_moderation.sql`: read the
credential from `vault.decrypted_secrets`, then `net.http_post`.

```sql
select decrypted_secret into v_token from vault.decrypted_secrets
 where name = 'github_dispatch_token';

perform net.http_post(
  url     := 'https://api.github.com/repos/Ak2556/echo-mobile/dispatches',
  headers := jsonb_build_object(
               'Authorization', 'Bearer ' || v_token,
               'Accept', 'application/vnd.github+json',
               'Content-Type', 'application/json'),
  body    := jsonb_build_object('event_type', 'transcode-video'));
```

**The credential must come from the vault, not from `current_setting`.** The
removed transcode trigger read `current_setting('app.settings.edge_function_url')`
with a fallback of `http://kong:8000` — a local-development address that silently
does nothing in production, which is the only reason it never broke anything. A
missing vault secret fails loudly instead, and this project has already lost a
week to a cron that was dead because its vault secret was absent.

The dispatch is fire-and-forget and its failure is not fatal: the job row is
already committed, so the hourly safety net will pick it up.

## The job table

```sql
create table public.video_jobs (
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
create unique index video_jobs_echo_uniq on public.video_jobs (echo_id);
create index video_jobs_pending_idx on public.video_jobs (status, created_at)
  where status in ('pending','encoding');
```

RLS enabled with no client policy: only the encoder's service role touches it.

Claiming is atomic and batched — a workflow run drains several jobs rather than
one — and reclaims work abandoned by a run that was cancelled or timed out:

```sql
update video_jobs
   set status='encoding', claimed_at=now(), attempts=attempts+1, updated_at=now()
 where id = (
   select id from video_jobs
    where status='pending'
       or (status='encoding' and claimed_at < now() - interval '15 minutes')
    order by created_at
    limit :batch
    for update skip locked)
returning *;
```

`FOR UPDATE SKIP LOCKED` means two workflow runs overlapping — which GitHub
permits — cannot claim the same job. The `claimed_at` clause is the recovery
path: a run cancelled mid-encode leaves rows in `encoding` forever without it,
and a cancelled run is normal on Actions, not exceptional.

`attempts` caps at 3, after which the row rests in `failed` with `last_error`.

## The encoder

**Source-aware rungs.** Uploads are already ≤720p and Android's Medium is often
480p, so a fixed three-rung ladder would upscale — a larger file with no more
detail than the source. The rule is: emit the fixed rungs strictly *below* the
source height, plus a top rung at `min(source_height, 720)`.

```
source 720p → 360p, 540p, 720p
source 480p → 360p, 480p        (540 skipped; top rung is the source height)
source 360p → 360p              (single-rung manifest; the job still completes)
```

Defining the top rung by source height rather than by a fixed list is what
stops a 480p upload from topping out at 360p — the ladder must never offer less
than the original did.

**Quality-targeted, not bitrate-targeted**, so a static talking head does not
cost the same as a fast pan. Settings are chosen by the band a rung's height
falls into, so the source-height top rung is covered without a special case:

```
height ≤ 360   -crf 26  -maxrate 800k   -bufsize 1600k
height ≤ 540   -crf 25  -maxrate 1500k  -bufsize 3000k
height ≤ 720   -crf 24  -maxrate 2800k  -bufsize 5600k
audio           AAC 64k mono
scaling         -vf scale=-2:<height>
```

**The top rung is a remux, not a re-encode, when it can be.** If the source is
already H.264/AAC (which phone recordings are) and at or below 720p, the top
rung is packaged with `-c copy` — segmented into TS without touching the video
stream. That is faster and strictly higher quality than re-encoding a file to
its own resolution. Falls back to a normal encode when the codec or profile is
unsuitable, so an unusual upload cannot fail the job.

`scale=-2:H` preserves aspect ratio and forces even dimensions, which H.264
requires; `-1` can yield an odd width and fail the encode outright. Audio is
mono because this is a voice-first app — stereo music is not the payload.

**The runner has no ffmpeg.** Measured, not assumed — the first probe of
`ubuntu-latest` reported `ffmpeg: command not found`, contradicting the
expectation this design was initially sketched on. It is installed per run from
a static build (`FedericoCarboni/setup-ffmpeg@v3`, ffmpeg 7.0.2), which does
provide `libx264`, `aac` and the `hls` muxer. `aws-cli` 2.36.29 IS preinstalled,
so the R2 upload needs no extra tooling.

**Measured throughput.** A synthetic 60-second 720p source through the full
three-rung ladder took **19.7 seconds** on the standard 4-CPU / 15 GB runner.
The synthetic source (`testsrc2`) is high-entropy and harder to encode than real
phone footage, so this is an upper bound. A five-minute cron can therefore drain
a substantial backlog in a single run, and batch size is bounded by the job
timeout rather than by CPU.

**MPEG-TS segments, 4 seconds.** fMP4/CMAF is more efficient and both ExoPlayer
and AVPlayer support it, but TS has fewer edge cases and this is the first
version of a pipeline operated by one person. 4s balances switch responsiveness
against request count; a 60s video becomes 15 segments per rung.

## R2 layout

Derived from the original key, so no lookup table is needed:

```
echo-media/<uid>/<ts>_video.mp4              ← original, kept
echo-media/<uid>/<ts>_hls/master.m3u8        ← hls_url points here
echo-media/<uid>/<ts>_hls/360p/index.m3u8 + seg_00001.ts …
echo-media/<uid>/<ts>_hls/540p/…
echo-media/<uid>/<ts>_hls/720p/…
```

**The original is kept.** It is the fallback when HLS playback errors, it allows
re-encoding with better settings later without asking users to re-upload, and at
60-second clips the storage is negligible against R2's $0.015/GB.

**`hls_url` is written only after the manifest exists in R2.** This is not a
style preference. Migration `20260824180000_drop_simulated_transcode.sql`
removed an earlier trigger that wrote an `hls_url` by swapping `.mp4` for
`.m3u8` on the original URL — a file that never existed. Because
`mapSupabaseEcho.ts:94` prefers `hls_url`, every video it touched would have
played from a 404; it was harmless only because it was never deployed. That
migration's closing line is explicit: *"What should not come back is a
placeholder that writes a URL nobody serves."* The write happens last, after
every segment and manifest has been uploaded and verified, or not at all.

Two things the encoder must get right on PUT, both of which fail silently:

- `Content-Type`: `application/vnd.apple.mpegurl` for `.m3u8`,
  `video/mp2t` for `.ts`. The worker serves whatever was stored, via
  `writeHttpMetadata`.
- Manifests must use **relative** segment URIs, so a playlist works regardless
  of which host serves it.

Caching needs no change: keys embed the upload timestamp and are never
rewritten, so the worker's existing `immutable, max-age=31536000` already
applies.

## App changes

Almost none, which is the strongest argument for this design. `hls_url` is
already preferred, `.m3u8` already maps to HLS, and every surface — feed, flow,
profile — upgrades on next fetch with no store release.

Two additions:

1. **HLS → MP4 fallback.** `VideoPreview` renders an error state
   (`src/features/feed/ui/VideoPreview.tsx:211`) but never retries with another
   source. On `loadState === 'error'`, if the current source was HLS, retry once
   with the original. Roughly ten lines, and it converts a whole class of
   pipeline bug into silent degradation rather than a dead card — a bad encoder
   deploy cannot take video down for everyone.
2. **CORS on `/media` in the worker.** `Access-Control-Allow-Origin: *` for the
   public buckets. Native playback does not need it; the web build does, and
   without it HLS fails there with an opaque error.

## Failure and visibility

The health signal is deliberately not "did the last job succeed". If the
encoder stops running — a disabled schedule, a revoked secret, a workflow
someone deleted — jobs still enqueue and nothing errors. The table quietly fills,
and that is the only symptom:

```sql
select max(now() - created_at) from video_jobs where status = 'pending';
```

Oldest-pending age is the liveness check, asserted by a new `audit-backend`
check against a 30-minute threshold.

| Failure | Behaviour |
|---|---|
| Run cancelled or times out mid-encode | Row stuck in `encoding`; reclaimed after 15 minutes |
| Scheduled run skipped or delayed by GitHub | Jobs stay `pending`; the next run drains them |
| Workflow auto-disabled after 60 days idle | Jobs accumulate; oldest-pending age trips the audit |
| Secrets rotated or revoked | Job fails on upload, `last_error` records it, `attempts` caps at 3 |
| ffmpeg fails on one file | `attempts` increments; after 3 → `failed` with `last_error` |
| Encoder writes a bad manifest | App falls back to the original MP4 |
| Job never enqueued | Trigger-based, so an un-jobbed video row is itself queryable |

## Publishing is progressive

The echo appears immediately and plays the original MP4 — which starts quickly
now that ranges work. `hls_url` is written when encoding completes and the app
upgrades on next fetch. A transcode that never finishes degrades to today's
behaviour rather than a missing post.

## Backfill

One statement, because the trigger keys off the row rather than the upload:

```sql
insert into video_jobs (echo_id, source_url)
select id, (select u from unnest(media_urls) u where u ~* '\.(mp4|mov|m4v)$' limit 1)
  from public_echoes
 where hls_url is null and media_urls is not null;
```

Ten videos exist today, so this proves the pipeline on real content before
anyone uploads anything new.

## Cost

**$0 for compute.** GitHub Actions is free and unmetered for public
repositories on standard runners. R2 storage for renditions is roughly $1/month
at 10,000 videos, and egress is $0. Nothing in this pipeline scales with views,
which is the entire reason for not using a managed service.

If the repository is ever made private, Actions becomes metered and this
decision has to be revisited — at ~20 seconds per video plus install overhead,
the free tier for private repos would be exhausted well before launch volume.

## What to switch, and when

The encoder is deliberately the only replaceable part. `video_jobs` does not
know or care what drains it, so moving off GitHub Actions is a deployment
change, not a migration: no schema change, no app change, no backfill, and the
two can run side by side while you watch.

**The trigger to watch is a monthly Actions bill above roughly $10**, which
happens somewhere around 2,000 videos a month. Below that, Actions is free and
operating nothing is worth more than the difference. Above it, the cost is both
higher and less predictable than a flat container, and it grows with a number
you do not control.

    select count(*) from video_jobs
     where created_at > now() - interval '30 days';

Watch that alongside the Actions usage page. When it approaches 2,000, switch.

**What switching looks like:** run the same ffmpeg pipeline in a small
always-on container (Fly, Railway, Render — roughly $5-10/month flat), pointed
at the same table with the same claim query. Delete the workflow and the
dispatch trigger once the container has been draining cleanly for a day. The
`FOR UPDATE SKIP LOCKED` claim already tolerates both running at once, so the
cutover needs no downtime and no coordination.

**Three other signals that mean switch early**, regardless of volume:

- **Latency becomes a complaint.** Actions dispatch-to-start is seconds to a
  minute; a container polling is sub-second. If people notice videos looking
  soft for the first minute, that is the fix.
- **The repository stops being the deploy unit.** Encoding inside CI couples
  your media pipeline to your source control. If a CI outage or a bad workflow
  edit starts blocking video, that coupling has become a liability.
- **Encoding needs more than a runner gives.** GPU encoding, longer videos than
  the six-hour job limit, or per-rung parallelism across machines all argue for
  a container before cost does.

**What does not change on switching:** the job table, the trigger that enqueues,
the claim semantics, the R2 layout, `hls_url` being written last, the
oldest-pending liveness check, and every line of app code. That is the point of
putting the queue in Postgres rather than in the CI system.

## Explicitly out of scope

- Data Saver capping the ladder to 360p. Today Data Saver shows a placeholder
  and plays nothing; making it play the lowest rung is the first thing the
  ladder unlocks, but it is a product decision and not part of v1.
- fMP4/CMAF packaging.
- Re-encoding the original to a smaller archival copy.
- Thumbnails. There are none today, which is why the Flow's released-player
  placeholder is blank; extracting a poster frame during transcode is an obvious
  follow-on but is not required for adaptivity.
- Per-rung analytics.

## Standing constraint

The project is in feature freeze pending store submission. This is a new service
to run and pay for, and it is not the launch blocker — the AI quota and the
stuck Apple enrolment are. The load-latency fix that shipped on 2026-09-04
(byte ranges) addressed the symptom users actually reported; this addresses the
remaining bandwidth adaptivity and should be sequenced accordingly.
