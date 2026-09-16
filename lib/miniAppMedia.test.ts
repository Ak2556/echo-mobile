import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  uploadAsync: vi.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

const getSession = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));
vi.mock('./remoteConfig', () => ({ isSupabaseRemote: () => true }));

import { clearMiniAppMediaUrlCache, getMiniAppMediaUrl, getMiniAppMediaUrls } from './miniAppMedia';
import { WORKER_URL } from './workerUrl';

/**
 * Mini-app media is private. The worker signs short-lived URLs for the owner in
 * batches, and the client reuses a URL until it is close to expiring.
 */

const fetchMock = vi.fn();

function signerReply(paths: string[], expiresIn = 3600) {
  return new Response(
    JSON.stringify({ urls: Object.fromEntries(paths.map(p => [p, `https://r2.example/${p}?sig=1`])), expiresIn }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  clearMiniAppMediaUrlCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } });
});

describe('getMiniAppMediaUrls', () => {
  it('asks the worker once, with the session token, and returns URLs by path', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      signerReply(JSON.parse(String(init.body)).paths));

    const urls = await getMiniAppMediaUrls(['u1/a.m4a', 'u1/b.jpg', null, 'u1/a.m4a']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WORKER_URL}/mini-app-media-urls`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body).paths).toEqual(['u1/a.m4a', 'u1/b.jpg']);
    expect(urls).toEqual({
      'u1/a.m4a': 'https://r2.example/u1/a.m4a?sig=1',
      'u1/b.jpg': 'https://r2.example/u1/b.jpg?sig=1',
    });
  });

  it('reuses a URL that is not about to expire, so the image cache stays warm', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      signerReply(JSON.parse(String(init.body)).paths));
    await getMiniAppMediaUrls(['u1/a.m4a']);
    await getMiniAppMediaUrls(['u1/a.m4a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again for a URL that is about to expire', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      signerReply(JSON.parse(String(init.body)).paths, 120));
    await getMiniAppMediaUrls(['u1/a.m4a']);
    await getMiniAppMediaUrls(['u1/a.m4a']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('splits a large gallery into batches of 100', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      signerReply(JSON.parse(String(init.body)).paths));
    const paths = Array.from({ length: 250 }, (_, i) => `u1/${i}.jpg`);
    const urls = await getMiniAppMediaUrls(paths);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).paths.length)).toEqual([100, 100, 50]);
    expect(Object.keys(urls)).toHaveLength(250);
  });

  it('ignores anything the worker returns that was not asked for', async () => {
    fetchMock.mockResolvedValue(signerReply(['u1/a.m4a', 'someone-else/x.jpg']));
    expect(await getMiniAppMediaUrls(['u1/a.m4a'])).toEqual({ 'u1/a.m4a': 'https://r2.example/u1/a.m4a?sig=1' });
  });

  it('returns nothing without a session, and does not call the worker', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await getMiniAppMediaUrls(['u1/a.m4a'])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns nothing when offline, so callers fall back to the local file', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await getMiniAppMediaUrls(['u1/a.m4a'])).toEqual({});
    expect(await getMiniAppMediaUrl('u1/a.m4a')).toBeNull();
  });

  it('returns nothing when the worker refuses', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 401 }));
    expect(await getMiniAppMediaUrl('u1/a.m4a')).toBeNull();
  });
});
