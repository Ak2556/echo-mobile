# Migrating legacy Supabase Storage media to R2

**Date:** 2026-09-10
**Status:** approved, not yet executed (blocked on the Supabase project being unrestricted)

## Why

On 2026-09-10 the Supabase project began returning HTTP 402 on every
endpoint — auth, REST and storage alike:

> Service for this project is restricted due to the following violations:
> exceed_cached_egress_quota.

Media is the heaviest thing the project serves, and it is mid-migration.
Uploads already go to Cloudflare R2 through the worker; only historical
objects remain on Supabase Storage. So the app currently reads from two
origins:

| Origin | Used by | During the restriction |
|---|---|---|
| R2, via `echo-mobile.<...>.workers.dev/media/...` | newer echoes | serving normally |
| Supabase Storage | older echoes | HTTP 402 |

That split also explains a video bug that resisted four rounds of
diagnosis: AVFoundation loaded the URLs fine from a laptop, the files were
well-formed HEVC (`hvc1`, `moov` ahead of `mdat`), both hosts advertised
byte-range support, and yet expo-video reported `error` on device and fell
back to a WebView. The videos that failed were the ones still on Supabase
Storage.

Pointing every legacy URL at R2 therefore does two things at once: it fixes
the historical media, and it removes the egress that caused the outage.

## Scope

**In scope.** Copy legacy objects from Supabase Storage to R2, and rewrite
legacy public storage URLs to worker URLs on the client.

**Out of scope, deliberately.**

- *Deleting the Supabase originals.* That is a cost optimisation, not an
  outage fix, and it is the irreversible half. Egress stops the moment
  nothing requests those URLs, which this design already achieves. Revisit
  once this has proven itself in production.
- *Rewriting DB rows.* Same reasoning: a missed row would mean media broken
  permanently rather than merely served from the old place. The client-side
  normalisation covers every row without mutating any.
- *Verification selfies.* `verificationApi.submitVerification` still uploads
  to the Supabase `verification` bucket. It is sensitive PII, low volume,
  read by an edge function rather than the client, and there is no R2 bucket
  behind it. Migrating it is a separate decision with its own privacy
  considerations.

## Design

### 1. `normalizeLegacyMediaUrl` (client)

A pure function in `lib/workerUrl.ts`, beside the existing `publicMediaUrl`.

Matches `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`
and returns `publicMediaUrl(bucket, path)`. Anything else is returned
unchanged, which makes it idempotent and safe to apply more than once.

Three exclusions, each load-bearing:

- **Signed URLs** (`/object/sign/...`) are left alone. They carry an expiring
  token; rewriting one produces a URL that cannot authenticate.
- **`dm-media`** is left alone. It is access-controlled and served from
  `/dm-media`, not `/media` — `dmMediaUrl` already handles it.
- **Buckets outside `PublicBucket`** are left alone, `verification` above
  all. The worker has no R2 binding for them, so a rewrite would turn a
  working image into a 404.

The allowlist is the existing `PublicBucket` type rather than a second copy
of the same list, so the two cannot drift.

**Applied at the mappers**, where a stored URL becomes a client URL:
`mapSupabaseEcho.ts` for `mediaUris`, `videoUri` and the author/co-author
`avatarUrl`. One boundary, not scattered call sites.

### 2. `scripts/migrate-storage-to-r2.mjs`

Lists each bucket in Supabase Storage and, per object:

1. `HEAD` the worker's `/media/<bucket>/<path>`. If it is already in R2,
   skip. This makes the whole run idempotent and resumable — a failure
   halfway through costs only the objects not yet copied.
2. Otherwise download from Supabase and put to R2 with
   `wrangler r2 object put`, which needs no app session token (the worker's
   `/upload-url` endpoint requires a signed-in user's bearer token, which a
   script has no good way to obtain).

**It never deletes anything.** Defaults to `--dry-run`; `--apply` performs
the copy. Emits a JSON report of copied / skipped / failed with reasons, so
a partial run can be reasoned about rather than re-run blindly.

### 3. Order of operations

Not interchangeable:

1. Backfill runs to completion.
2. Verify a sample — compare `content-length` and `etag` across both origins.
3. **Only then** ship the normaliser.

Shipping the client change first would point every legacy URL at objects
that are not in R2 yet, breaking media that currently works.

## Testing

`normalizeLegacyMediaUrl` gets unit tests covering: a public URL in each
allowed bucket; `verification` and `dm-media` left untouched; signed URLs
left untouched; non-Supabase URLs left untouched; idempotency under double
application; and paths containing slashes and query strings.

The backfill's test is its own `--dry-run` against the real bucket listing:
it reports what it would copy without copying, which is the only honest
rehearsal for a data migration.

## Risks

- **The worker must support Range for video.** It does — verified in
  `cloudflare/src/index.ts`, which passes the request's range headers to
  `R2Bucket.get`. Without it, video would fail to seek.
- **A bucket that exists in Supabase but not in R2.** The allowlist
  prevents a rewrite; such objects keep pointing at Supabase and remain
  broken while the project is restricted. The migration report names them.
- **Objects too large for a single `wrangler r2 object put`.** The report
  records the failure rather than silently skipping; multipart upload is a
  follow-up if any object actually hits it.
