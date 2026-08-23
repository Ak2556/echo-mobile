/**
 * These URLs are only ever exercised by an <Image source={{ uri }} /> or a
 * background upload, so getting one wrong fails silently — the image just does
 * not appear. Two real bugs of exactly that shape shipped before these tests
 * existed, both from a missing path segment.
 */
import { describe, expect, it } from 'vitest';
import { WORKER_URL, dmMediaUrl, publicMediaUrl, uploadUrlEndpoint } from './workerUrl';

describe('public media URLs', () => {
  it('includes the /media prefix', () => {
    // Without it the request falls through to the worker's auth middleware and
    // returns 401 rather than the object.
    expect(publicMediaUrl('echo-media', 'uid/123_0.jpg'))
      .toBe(`${WORKER_URL}/media/echo-media/uid/123_0.jpg`);
  });

  it('includes the bucket segment', () => {
    // The original R2 URL dropped it, so every stored image URL 404'd.
    const url = publicMediaUrl('mini-app-media', 'uid/habits/x.png');
    expect(url).toContain('/media/mini-app-media/');
  });

  it('does not double the slash when the path is already rooted', () => {
    expect(publicMediaUrl('avatars', '/uid/avatar.png'))
      .toBe(`${WORKER_URL}/media/avatars/uid/avatar.png`);
  });
});

describe('DM media stays off the public route', () => {
  it('is served from /dm-media, not /media', () => {
    // /media is unauthenticated by design. DM attachments must keep going
    // through the route that checks conversation membership.
    const url = dmMediaUrl('uid/secret.jpg');
    expect(url).toContain('/dm-media/');
    expect(url).not.toContain('/media/');
  });
});

describe('upload endpoint', () => {
  it('passes bucket and path as query parameters', () => {
    expect(uploadUrlEndpoint('echo-media', 'uid/1_0.jpg'))
      .toBe(`${WORKER_URL}/upload-url?bucket=echo-media&path=uid/1_0.jpg`);
  });
});

describe('base URL', () => {
  it('carries no trailing slash, so callers can always append', () => {
    expect(WORKER_URL).not.toMatch(/\/$/);
  });

  it('is absolute', () => {
    expect(WORKER_URL).toMatch(/^https:\/\//);
  });
});
