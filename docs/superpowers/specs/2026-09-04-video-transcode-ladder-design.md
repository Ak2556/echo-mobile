# Video transcode ladder — design

**Date:** 2026-09-04
**Status:** approved design, not yet implemented
**Scope:** an HLS adaptive ladder for feed video; no change to the upload path, and almost none to the app

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
roughly $1,000/month against roughly $1 for R2 storage plus a flat container.
For a high-view, low-revenue-per-user audience that is the wrong shape of bill,
and this project is already constrained by cost elsewhere.

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

Claiming is atomic, and reclaims work abandoned by a crashed container:

```sql
update video_jobs
   set status='encoding', claimed_at=now(), attempts=attempts+1, updated_at=now()
 where id = (
   select id from video_jobs
    where status='pending'
       or (status='encoding' and claimed_at < now() - interval '15 minutes')
    order by created_at
    limit 1
    for update skip locked)
returning *;
```

`FOR UPDATE SKIP LOCKED` means a second container can be added later with no
change. The `claimed_at` clause is the crash recovery: without it, one container
death strands a video permanently.

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
container dies, jobs still enqueue and nothing errors — the table quietly fills,
and that is the only symptom:

```sql
select max(now() - created_at) from video_jobs where status = 'pending';
```

Oldest-pending age is the liveness check, asserted by a new `audit-backend`
check against a 30-minute threshold.

| Failure | Behaviour |
|---|---|
| Container dies mid-encode | Row stuck in `encoding`; reclaimed after 15 minutes |
| Container dies entirely | Jobs accumulate as `pending`; oldest-pending age trips the audit |
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

Container ~$5–10/month flat, R2 storage for renditions ~$1/month at 10,000
videos, egress $0. The bill does not grow with views, which is the entire reason
for not using a managed service.

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
