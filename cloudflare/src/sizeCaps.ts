// Size ceilings for user uploads, enforced after the fact.
//
// /upload-url hands out a presigned PUT, and R2 has no way to put a length limit
// on one: aws4fetch will not sign Content-Length, and R2 has no POST policy. The
// only size limit was on the phone (lib/imageUploadPrep, lib/videoUploadGuard),
// which a script talking to the API never runs. So an account could store files
// of any size, in six buckets, until the bill noticed.
//
// A scheduled sweep closes that without touching a single client: it lists each
// bucket and deletes user objects over the ceiling. The cost of the window
// between upload and sweep is storage by the hour, which is pennies; egress from
// R2 is free.
//
// Only keys that start with a user id are considered. Upload paths must (see
// uploadPathAllowed's caller), and it keeps the sweep away from operator
// objects: echo-media/downloads/echo-latest.apk is 190 MB and must never be
// treated as an oversized upload.

export const BUCKET_NAMES = [
  'avatars',
  'echo-media',
  'dm-media',
  'mini-app-media',
  'marketplace-photos',
  'learn-lectures',
] as const;
export type BucketName = (typeof BUCKET_NAMES)[number];

const MB = 1024 * 1024;

/**
 * Each ceiling is the largest thing the app itself will send, plus headroom, so
 * enforcing it never removes a legitimate upload:
 *   avatars       resized to 512 px on the phone
 *   echo-media    ECHO_MEDIA_BUCKET_BYTES, 50 MB (lib/videoUploadGuard.ts)
 *   dm-media      same media pickers as posts
 *   mini-app-media  studio clips run to two minutes of camera-original video
 *   marketplace-photos  listing photos
 *   learn-lectures  MAX_LECTURE_BYTES, 500 MB (lib/learnApi.ts)
 */
export const OBJECT_SIZE_CAPS: Record<BucketName, number> = {
  avatars: 5 * MB,
  'echo-media': 55 * MB,
  'dm-media': 55 * MB,
  'mini-app-media': 320 * MB,
  'marketplace-photos': 12 * MB,
  'learn-lectures': 520 * MB,
};

/** `${userId}/...`, which is what every upload path starts with. */
export const USER_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

interface ListedObject { key: string; size: number }
interface SweepBucket {
  list(options: { cursor?: string; limit?: number }): Promise<{ objects: ListedObject[]; truncated: boolean; cursor?: string }>;
  delete(keys: string[]): Promise<void>;
}

export interface SweepResult {
  scanned: number;
  oversized: { key: string; size: number }[];
  deleted: number;
}

/**
 * Find (and, when `enforce`, delete) user objects larger than `cap`.
 * Pages through the whole bucket: R2 lists 1000 keys at a time and not in
 * upload order, so there is no cheaper window to look at. Revisit past ~100k
 * objects by sweeping per day or per user prefix.
 */
export async function sweepOversized(bucket: SweepBucket, cap: number, enforce: boolean): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, oversized: [], deleted: 0 };
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    const hits: string[] = [];
    for (const o of page.objects) {
      result.scanned++;
      if (!USER_KEY.test(o.key) || o.size <= cap) continue;
      result.oversized.push({ key: o.key, size: o.size });
      hits.push(o.key);
    }
    if (enforce && hits.length) {
      await bucket.delete(hits);
      result.deleted += hits.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return result;
}
