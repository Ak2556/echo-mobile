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
