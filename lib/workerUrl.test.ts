import { describe, expect, it } from 'vitest';
import { normalizeLegacyMediaUrl, WORKER_URL } from './workerUrl';

/**
 * The exclusions are the whole risk here. Rewriting a bucket that has no R2
 * object behind it turns working media into a 404, and rewriting a signed URL
 * strips the token it needs — both are worse than leaving the URL alone.
 */

const LEGACY = 'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public';

describe('normalizeLegacyMediaUrl', () => {
  it.each([
    ['echo-media', 'user-1/1787386061572_video.mp4'],
    ['avatars', 'user-1/avatar.jpg'],
    ['mini-app-media', 'user-1/note.png'],
    ['marketplace-photos', 'user-1/listing.webp'],
  ])('rewrites %s to the worker', (bucket, path) => {
    expect(normalizeLegacyMediaUrl(`${LEGACY}/${bucket}/${path}`))
      .toBe(`${WORKER_URL}/media/${bucket}/${path}`);
  });

  it('leaves verification alone — there is no R2 bucket behind it', () => {
    const url = `${LEGACY}/verification/user-1/1234.jpg`;
    expect(normalizeLegacyMediaUrl(url)).toBe(url);
  });

  it('leaves dm-media alone — it is served from /dm-media, not /media', () => {
    const url = `${LEGACY}/dm-media/user-1/photo.jpg`;
    expect(normalizeLegacyMediaUrl(url)).toBe(url);
  });

  it('leaves a signed url alone — rewriting strips the token it needs', () => {
    const url = 'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/sign/echo-media/u/a.mp4?token=abc.def';
    expect(normalizeLegacyMediaUrl(url)).toBe(url);
  });

  it.each([
    ['a worker url already', `${WORKER_URL}/media/echo-media/u/a.mp4`],
    ['an unrelated host', 'https://cdn.example.com/echo-media/u/a.mp4'],
    ['a local file', 'file:///var/mobile/a.mp4'],
    ['a relative path', '/echo-media/u/a.mp4'],
  ])('leaves %s untouched', (_label, url) => {
    expect(normalizeLegacyMediaUrl(url)).toBe(url);
  });

  it('is idempotent — applying it twice changes nothing', () => {
    const once = normalizeLegacyMediaUrl(`${LEGACY}/echo-media/u/a.mp4`);
    expect(normalizeLegacyMediaUrl(once)).toBe(once);
  });

  it('keeps nested paths intact', () => {
    expect(normalizeLegacyMediaUrl(`${LEGACY}/echo-media/a/b/c/d.mp4`))
      .toBe(`${WORKER_URL}/media/echo-media/a/b/c/d.mp4`);
  });

  it('drops the query string — R2 keys never carry one', () => {
    expect(normalizeLegacyMediaUrl(`${LEGACY}/echo-media/u/a.mp4?t=123`))
      .toBe(`${WORKER_URL}/media/echo-media/u/a.mp4`);
  });

  it('decodes a percent-encoded path so the R2 key matches', () => {
    expect(normalizeLegacyMediaUrl(`${LEGACY}/echo-media/u/my%20clip.mp4`))
      .toBe(`${WORKER_URL}/media/echo-media/u/my clip.mp4`);
  });

  it('passes empty-ish input through without throwing', () => {
    // '' stays '' — the contract is "unchanged unless it matched". null
    // collapses to undefined because the signature returns string | undefined.
    expect(normalizeLegacyMediaUrl('')).toBe('');
    expect(normalizeLegacyMediaUrl(undefined)).toBeUndefined();
    expect(normalizeLegacyMediaUrl(null)).toBeUndefined();
  });
});
