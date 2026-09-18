import { describe, expect, it } from 'vitest';
import {
  ECHO_MEDIA_BUCKET_BYTES,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_UPLOAD_BYTES,
  videoUploadVerdict,
} from './videoUploadGuard';

/**
 * The client used to allow 100 MB while storage.buckets caps echo-media at
 * 50 MB, so a 60 MB clip passed every check on the phone and then failed at the
 * end of the upload — after the user had waited through the whole transfer on
 * the sort of connection this app is launching into. A limit the server does
 * not share is not a limit, it is a delayed error.
 *
 * Measured on production before this was written: the largest stored videos are
 * 28.3 MB at 17.6 Mbps and 14.3 MB at 29.0 Mbps, both far above the 4–6 Mbps a
 * 1080p stream normally uses. They come from Android, where expo-image-picker's
 * `videoExportPreset` is iOS-only and `quality` does not apply to video, so the
 * camera's original bitrate is uploaded untouched. Capping bytes does not fix
 * that — only re-encoding does — but it stops the worst of it reaching anyone.
 */
describe('videoUploadVerdict', () => {
  const ok = { bytes: 8 * 1024 * 1024, durationMs: 30_000 };

  it('accepts an ordinary clip', () => {
    expect(videoUploadVerdict(ok).ok).toBe(true);
  });

  it('never permits more than the bucket will store', () => {
    // The whole point: the client limit cannot exceed the server's, or the
    // failure is discovered only after the upload.
    expect(MAX_VIDEO_UPLOAD_BYTES).toBeLessThanOrEqual(ECHO_MEDIA_BUCKET_BYTES);
  });

  it('rejects a file the bucket would refuse', () => {
    const v = videoUploadVerdict({ ...ok, bytes: ECHO_MEDIA_BUCKET_BYTES + 1 });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe('too-large');
      // The message has to name the actual size; "too large" alone leaves the
      // user guessing how much to trim.
      expect(v.message).toMatch(/MB/);
    }
  });

  it('rejects a clip longer than the duration limit', () => {
    const v = videoUploadVerdict({ ...ok, durationMs: MAX_VIDEO_DURATION_MS + 1 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('too-long');
  });

  it('reports length before size when a clip breaks both', () => {
    // Trimming is the action that fixes both, so it is the one to name.
    const v = videoUploadVerdict({ bytes: ECHO_MEDIA_BUCKET_BYTES * 2, durationMs: MAX_VIDEO_DURATION_MS * 2 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('too-long');
  });

  it('accepts a file exactly at the limit', () => {
    expect(videoUploadVerdict({ bytes: MAX_VIDEO_UPLOAD_BYTES, durationMs: MAX_VIDEO_DURATION_MS }).ok).toBe(true);
  });

  it('does not block when the size is unknown', () => {
    // expo-image-picker omits fileSize on some Android providers. Refusing on
    // ignorance would block legitimate posts; the caller stats the file first,
    // and if that also fails the upload is allowed to try.
    expect(videoUploadVerdict({ bytes: undefined, durationMs: 10_000 }).ok).toBe(true);
    expect(videoUploadVerdict({ bytes: 0, durationMs: 10_000 }).ok).toBe(true);
  });

  it('does not block when the duration is unknown', () => {
    expect(videoUploadVerdict({ bytes: 1024, durationMs: undefined }).ok).toBe(true);
  });

  it('flags an implausible bitrate without blocking it', () => {
    // A 5 MB two-second clip is ~20 Mbps — an untouched Android capture. It is
    // under every hard limit, so it uploads, but the caller may want to say so.
    const v = videoUploadVerdict({ bytes: 5 * 1024 * 1024, durationMs: 2_000 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.highBitrate).toBe(true);
  });

  it('does not flag a normal bitrate', () => {
    // 8 MB over 30s is ~2.2 Mbps.
    const v = videoUploadVerdict(ok);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.highBitrate).toBe(false);
  });
});
