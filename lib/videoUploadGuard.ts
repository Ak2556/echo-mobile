/**
 * Whether a picked video may be uploaded, decided before the transfer starts.
 *
 * The limit that matters is the bucket's. `storage.buckets` caps echo-media at
 * 50 MB; the create-post screen allowed 100 MB, so a 60 MB clip passed every
 * check on the phone and failed at the end of the upload. On the connections
 * this app is launching into, that is several minutes spent to be told no. A
 * limit the server does not share is not a limit, it is a delayed error.
 *
 * What this cannot fix: bitrate. expo-image-picker's `videoExportPreset` is
 * iOS-only and its `quality` option does not apply to video, so an Android
 * upload is the camera's original file. Measured on production, the stored
 * videos run to 17.6 and 29.0 Mbps against the 4–6 Mbps a 1080p stream normally
 * uses. Only re-encoding fixes that, and re-encoding needs a native transcoder
 * — a new dependency, a test stub and a build. `highBitrate` marks the case so
 * the caller can say something useful without blocking a legitimate short clip
 * that happens to be under every hard limit.
 */

/** Must track `file_size_limit` on storage.buckets for echo-media. */
export const ECHO_MEDIA_BUCKET_BYTES = 50 * 1024 * 1024;

/**
 * The client's own ceiling. Equal to the bucket's rather than lower, because
 * choosing a stricter product limit is a product decision; what is not
 * negotiable is that it never exceeds what the server will accept.
 */
export const MAX_VIDEO_UPLOAD_BYTES = ECHO_MEDIA_BUCKET_BYTES;

export const MAX_VIDEO_DURATION_MS = 60_000;

/** Above this, the file is an untouched camera capture rather than a shareable clip. */
const IMPLAUSIBLE_BITRATE_BPS = 12_000_000;

export type VideoUploadVerdict =
  | { ok: true; highBitrate: boolean }
  | { ok: false; code: 'too-long' | 'too-large'; message: string };

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function videoUploadVerdict(input: {
  bytes?: number | null;
  durationMs?: number | null;
}): VideoUploadVerdict {
  const bytes = typeof input.bytes === 'number' && input.bytes > 0 ? input.bytes : null;
  const durationMs = typeof input.durationMs === 'number' && input.durationMs > 0 ? input.durationMs : null;

  // Length first when a clip breaks both limits: trimming is the single action
  // that fixes each, so it is the one worth naming.
  if (durationMs !== null && durationMs > MAX_VIDEO_DURATION_MS) {
    return {
      ok: false,
      code: 'too-long',
      message: `This clip is ${Math.round(durationMs / 1000)} seconds. Trim it to ${Math.round(MAX_VIDEO_DURATION_MS / 1000)} seconds or less.`,
    };
  }

  if (bytes !== null && bytes > MAX_VIDEO_UPLOAD_BYTES) {
    return {
      ok: false,
      code: 'too-large',
      message: `This video is ${formatMb(bytes)}, and the limit is ${formatMb(MAX_VIDEO_UPLOAD_BYTES)}. A shorter clip, or one recorded at a lower quality, will go through.`,
    };
  }

  // Unknown size is not a reason to refuse. expo-image-picker omits fileSize on
  // some Android providers; the caller stats the file first, and if that fails
  // too, letting the upload try is better than blocking a valid post.
  const highBitrate =
    bytes !== null && durationMs !== null && (bytes * 8) / (durationMs / 1000) > IMPLAUSIBLE_BITRATE_BPS;

  return { ok: true, highBitrate };
}
