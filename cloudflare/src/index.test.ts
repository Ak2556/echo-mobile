import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from './index';

/**
 * Route-level checks for the media worker's access rules, run with in-memory
 * R2 buckets, a fake edge cache and a stubbed Supabase. Nothing here talks to
 * Cloudflare.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';
const SUPABASE_URL = 'https://proj.supabase.co';

type Stored = { body: string; type: string };

function bucket(objects: Record<string, Stored> = {}) {
  const toObject = (key: string) => {
    const o = objects[key];
    if (!o) return null;
    return {
      body: o.body,
      size: o.body.length,
      httpEtag: `"${key}"`,
      writeHttpMetadata: (h: Headers) => h.set('Content-Type', o.type),
    };
  };
  return {
    get: vi.fn(async (key: string) => toObject(key)),
    head: vi.fn(async (key: string) => toObject(key)),
    delete: vi.fn(async () => undefined),
    list: vi.fn(async () => ({ objects: [], truncated: false })),
  };
}

let echoMedia: ReturnType<typeof bucket>;
let dmMedia: ReturnType<typeof bucket>;
let miniAppMedia: ReturnType<typeof bucket>;
let avatars: ReturnType<typeof bucket>;
let cachePut: ReturnType<typeof vi.fn>;
let cached: Response | undefined;
let memberOf: string[];
let fetchCalls: string[];

function env() {
  return {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon-key',
    PURGE_SECRET: 'purge',
    AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'secret',
    R2_ACCOUNT_ID: 'acct',
    AVATARS_BUCKET: avatars,
    ECHO_MEDIA_BUCKET: echoMedia,
    DM_MEDIA_BUCKET: dmMedia,
    MINI_APP_MEDIA_BUCKET: miniAppMedia,
    MARKETPLACE_PHOTOS_BUCKET: bucket(),
    LEARN_LECTURES_BUCKET: bucket(),
  };
}

const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };

function call(path: string, init: RequestInit = {}) {
  return app.request(path, init, env(), ctx as never);
}

const authed = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { Authorization: 'Bearer user-token', ...((init.headers as Record<string, string>) ?? {}) },
});

beforeEach(() => {
  echoMedia = bucket({
    [`${ME}/a.jpg`]: { body: 'jpeg-bytes', type: 'image/jpeg' },
    [`${ME}/page.jpg`]: { body: '<script>alert(1)</script>', type: 'text/html' },
    'downloads/echo-latest.apk': { body: 'apk-bytes', type: 'application/vnd.android.package-archive' },
  });
  dmMedia = bucket({
    [`${OTHER}/${CONV}/1.jpg`]: { body: 'dm-bytes', type: 'image/jpeg' },
    [`${OTHER}/legacy.jpg`]: { body: 'old-dm-bytes', type: 'image/jpeg' },
  });
  miniAppMedia = bucket({ [`${ME}/voice-memo/1-abc.m4a`]: { body: 'memo', type: 'audio/mp4' } });
  avatars = bucket({ [`${ME}/avatar.jpg`]: { body: 'avatar-bytes', type: 'image/jpeg' } });
  cached = undefined;
  memberOf = [];
  fetchCalls = [];

  cachePut = vi.fn(async () => undefined);
  vi.stubGlobal('caches', {
    default: {
      match: vi.fn(async () => cached),
      put: cachePut,
    },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    fetchCalls.push(url);
    if (url === `${SUPABASE_URL}/auth/v1/user`) return Response.json({ id: ME });
    const conv = /dm_conversations\?id=eq\.([0-9a-f-]+)/.exec(url);
    if (conv) return Response.json(memberOf.includes(conv[1]) ? [{ id: conv[1] }] : []);
    if (url.includes('/rest/v1/dm_conversation_members')) {
      return Response.json(memberOf.length ? [{ conversation_id: memberOf[0] }] : []);
    }
    if (url.includes('/rest/v1/dm_conversations?select=id')) return Response.json([]);
    return new Response('unexpected', { status: 500 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/media', () => {
  it('serves real media inline, with nosniff', async () => {
    const res = await call(`/media/echo-media/${ME}/a.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('never serves an uploaded page as a page, whatever the key ends in', async () => {
    const res = await call(`/media/echo-media/${ME}/page.jpg`);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="download.bin"');
  });

  it('re-derives headers for an entry cached before the fix', async () => {
    cached = new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    const res = await call(`/media/echo-media/${ME}/old.jpg`);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(echoMedia.get).not.toHaveBeenCalled();
  });

  it('keeps the real APK installable', async () => {
    const res = await call('/media/echo-media/downloads/echo-latest.apk');
    expect(res.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
  });

  // Regression: avatars are keyed `<uid>/avatar.<ext>` (supabaseEchoApi.uploadAvatar),
  // a FIXED key overwritten on every upload — so the "keys embed an upload
  // timestamp and are never rewritten" assumption behind the immutable year
  // does not hold for them. Served immutable, a new profile picture never
  // reaches anyone who already loaded the old one.
  it('does not serve an avatar immutable — the key is reused on every upload', async () => {
    const res = await call(`/media/avatars/${ME}/avatar.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, must-revalidate');
  });

  it('still edge-caches avatars, so a feed of them costs no extra R2 reads', async () => {
    await call(`/media/avatars/${ME}/avatar.jpg`);
    expect(cachePut).toHaveBeenCalled();
  });

  it('keeps the immutable year for timestamped post media', async () => {
    const res = await call(`/media/echo-media/${ME}/a.jpg`);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('still never edge-caches a withdrawable build', async () => {
    const res = await call('/media/echo-media/downloads/echo-latest.apk');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, must-revalidate');
    expect(cachePut).not.toHaveBeenCalled();
  });

  it('no longer serves private mini-app media publicly', async () => {
    const res = await call(`/media/mini-app-media/${ME}/voice-memo/1-abc.m4a`);
    expect(res.status).toBe(404);
    expect(miniAppMedia.get).not.toHaveBeenCalled();
  });
});

describe('/upload-url', () => {
  it('signs a short-lived URL for an ordinary upload', async () => {
    const res = await call(`/upload-url?bucket=echo-media&path=${ME}/1_0.jpg`, authed());
    expect(res.status).toBe(200);
    const { signedUrl } = (await res.json()) as { signedUrl: string };
    expect(new URL(signedUrl).searchParams.get('X-Amz-Expires')).toBe('900');
  });

  it.each(['evil.html', 'echo-latest.apk', 'logo.svg'])('refuses %s', async name => {
    const res = await call(`/upload-url?bucket=echo-media&path=${ME}/${name}`, authed());
    expect(res.status).toBe(400);
  });

  it("still refuses another user's directory", async () => {
    const res = await call(`/upload-url?bucket=echo-media&path=${OTHER}/a.jpg`, authed());
    expect(res.status).toBe(403);
  });
});

describe('/mini-app-media-urls', () => {
  const post = (body: unknown) =>
    call('/mini-app-media-urls', authed({
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }));

  it("signs only the caller's own keys", async () => {
    const own = `${ME}/voice-memo/1-abc.m4a`;
    const res = await post({ paths: [own, `${OTHER}/voice-memo/2.m4a`, `${ME}/../${OTHER}/x.m4a`] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { urls: Record<string, string>; expiresIn: number };
    expect(Object.keys(body.urls)).toEqual([own]);
    const signed = new URL(body.urls[own]);
    expect(signed.pathname).toBe(`/mini-app-media/${own}`);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(signed.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('caps the lifetime at six hours', async () => {
    const res = await post({ paths: [`${ME}/a.m4a`], expiresIn: 999999 });
    expect(((await res.json()) as { expiresIn: number }).expiresIn).toBe(21600);
  });

  it.each([
    ['an empty list', []],
    ['more than 100 paths', Array.from({ length: 101 }, (_, i) => `${ME}/${i}.m4a`)],
    ['something that is not a list', 'not-a-list'],
  ])('rejects %s', async (_label, paths) => {
    expect((await post({ paths })).status).toBe(400);
  });

  it('requires a signed-in caller', async () => {
    const res = await call('/mini-app-media-urls', { method: 'POST', body: '{"paths":[]}' });
    expect(res.status).toBe(401);
  });
});

describe('/dm-media', () => {
  it('refuses an owner segment that is not a UUID', async () => {
    const res = await call('/dm-media/not-a-uuid/x.jpg', authed());
    expect(res.status).toBe(400);
  });

  it('refuses someone who is not in the conversation the file belongs to', async () => {
    memberOf = ['44444444-4444-4444-8444-444444444444']; // shares a different thread with the sender
    const res = await call(`/dm-media/${OTHER}/${CONV}/1.jpg`, authed());
    expect(res.status).toBe(403);
    expect(dmMedia.get).not.toHaveBeenCalled();
    expect(fetchCalls.some(u => u.includes('dm_conversation_members'))).toBe(false);
  });

  it('serves a member of that conversation, privately and with nosniff', async () => {
    memberOf = [CONV];
    const res = await call(`/dm-media/${OTHER}/${CONV}/1.jpg`, authed());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('keeps the old any-shared-thread rule for legacy keys with no conversation', async () => {
    memberOf = [CONV];
    const res = await call(`/dm-media/${OTHER}/legacy.jpg`, authed());
    expect(res.status).toBe(200);
  });
});
