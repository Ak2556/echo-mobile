/**
 * The Cloudflare Worker that fronts R2.
 *
 * This URL was duplicated verbatim across seven call sites, which meant moving
 * the worker to a custom domain would have been a find-and-replace with no way
 * to tell whether one had been missed. It lives here now so the move is a
 * one-line change and the fallback can never drift between files.
 *
 * `EXPO_PUBLIC_*` is inlined at bundle time, so the fallback is what ships
 * whenever the variable is absent from the build environment — keep it
 * pointing at a host that actually works.
 */
const DEFAULT_WORKER_URL = 'https://echo-mobile.at3236129.workers.dev';

/** Base URL, never with a trailing slash. */
export const WORKER_URL = (
  process.env.EXPO_PUBLIC_CLOUDFLARE_WORKER_URL || DEFAULT_WORKER_URL
).replace(/\/+$/, '');

/** Buckets the worker serves publicly, under /media. Mirrors the worker's own list. */
export type PublicBucket = 'avatars' | 'echo-media' | 'mini-app-media' | 'marketplace-photos';

/**
 * Public read URL for an object.
 *
 * The `/media` prefix is required: without it the request falls through to the
 * worker's auth middleware and returns 401, which is invisible in an <Image>
 * that simply renders nothing.
 */
export function publicMediaUrl(bucket: PublicBucket, path: string): string {
  return `${WORKER_URL}/media/${bucket}/${path.replace(/^\/+/, '')}`;
}

/**
 * Legacy public Supabase Storage URL -> the worker URL for the same object.
 *
 * Media is mid-migration: uploads already go to R2 through the worker, but
 * echoes posted before that switch still carry
 * `<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`. Rewriting at
 * read time fixes every one of them without mutating a single row — and a row
 * missed by a bulk UPDATE would be media broken permanently rather than merely
 * served from the old place.
 *
 * Anything that does not match is returned unchanged, so this is idempotent and
 * safe to apply more than once.
 *
 * Three exclusions, each load-bearing:
 *
 *   - Signed URLs (`/object/sign/...`) carry an expiring token. Rewriting one
 *     produces a URL that cannot authenticate, so only `/object/public/` is
 *     matched.
 *   - `dm-media` is access-controlled and served from `/dm-media`, not
 *     `/media`. `dmMediaUrl` already handles it.
 *   - Buckets outside PublicBucket — `verification` above all — have no R2
 *     bucket behind them, so a rewrite would turn a working image into a 404.
 *     The allowlist is the PublicBucket type itself rather than a second copy,
 *     so the two cannot drift.
 */
const LEGACY_PUBLIC_STORAGE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/([^/?#]+)\/([^?#]+)(\?[^#]*)?/i;

const PUBLIC_BUCKETS: readonly PublicBucket[] = [
  'avatars',
  'echo-media',
  'mini-app-media',
  'marketplace-photos',
];

export function normalizeLegacyMediaUrl(url: string): string;
export function normalizeLegacyMediaUrl(url: string | undefined | null): string | undefined;
export function normalizeLegacyMediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return url ?? undefined;
  const match = LEGACY_PUBLIC_STORAGE.exec(url);
  if (!match) return url;

  const [, bucket, path] = match;
  if (!PUBLIC_BUCKETS.includes(bucket as PublicBucket)) return url;

  // The query string is dropped on purpose: on a public object it carries only
  // Supabase-specific cache hints, and R2 keys never contain one.
  return publicMediaUrl(bucket as PublicBucket, decodeURIComponent(path));
}

/** Endpoint that mints a presigned PUT for an upload. */
export function uploadUrlEndpoint(bucket: string, path: string): string {
  return `${WORKER_URL}/upload-url?bucket=${bucket}&path=${path}`;
}

/** DM media is access-controlled and is NOT served from /media. */
export function dmMediaUrl(path: string): string {
  return `${WORKER_URL}/dm-media/${path.replace(/^\/+/, '')}`;
}

/**
 * Endpoint that resolves a lecture to something playable.
 *
 * Lectures are not under /media. Access is decided by Postgres RLS, and an
 * upload comes back as a short-lived presigned R2 URL so the player can seek —
 * the worker's /media route ignores Range headers entirely and answers a range
 * request with the whole object.
 */
export function lectureUrlEndpoint(lectureId: string): string {
  return `${WORKER_URL}/learn-lecture-url?id=${encodeURIComponent(lectureId)}`;
}

/** The public page a tutor shares so people without an Echo account can book. */
export function bookingPageUrl(slug: string): string {
  return `${WORKER_URL}/book/${encodeURIComponent(slug)}`;
}
