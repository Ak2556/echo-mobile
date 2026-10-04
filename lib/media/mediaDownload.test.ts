import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * The guards here decide what gets written to the filesystem from a value that
 * arrived over the network, so they are worth pinning down rather than trusting
 * to review.
 */

const downloadAsync = vi.hoisted(() => vi.fn());
const shareAsync = vi.hoisted(() => vi.fn());
const isAvailableAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync,
}));
vi.mock('expo-sharing', () => ({ shareAsync, isAvailableAsync }));
// react-native is aliased to react-native-web, where Platform.OS is 'web' —
// which the module refuses outright. Pin it to a device platform.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import { saveMediaToDevice } from './mediaDownload';

const REMOTE = 'https://cdn.example.com/echo-media/abc/1787957689326_video.mp4';

describe('saveMediaToDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAvailableAsync.mockResolvedValue(true);
    downloadAsync.mockResolvedValue({ uri: 'file:///cache/x.mp4', status: 200 });
    shareAsync.mockResolvedValue(undefined);
  });

  it('downloads and hands the file to the share sheet', async () => {
    const result = await saveMediaToDevice(REMOTE);
    expect(result).toEqual({ ok: true });
    expect(downloadAsync).toHaveBeenCalledWith(REMOTE, 'file:///cache/1787957689326_video.mp4');
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/x.mp4');
  });

  it.each([
    ['nothing at all', undefined],
    ['an empty string', ''],
  ])('refuses %s without touching the filesystem', async (_label, input) => {
    const result = await saveMediaToDevice(input as undefined);
    expect(result.ok).toBe(false);
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['a local file', 'file:///private/var/secrets.mp4'],
    ['a script url', 'javascript:alert(1)'],
    ['an inline payload', 'data:video/mp4;base64,AAAA'],
    ['a scheme-relative url', '//cdn.example.com/x.mp4'],
  ])('refuses %s — only http(s) is downloaded', async (_label, uri) => {
    const result = await saveMediaToDevice(uri);
    expect(result.ok).toBe(false);
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('never lets a remote name escape the cache directory', async () => {
    await saveMediaToDevice('https://cdn.example.com/a/%2e%2e%2f%2e%2e%2fetc/passwd');
    const target = downloadAsync.mock.calls[0][1] as string;
    expect(target.startsWith('file:///cache/')).toBe(true);
    expect(target).not.toContain('..');
    expect(target).not.toContain('/etc/');
  });

  it('gives an extensionless name one, so iOS offers a Save target', async () => {
    await saveMediaToDevice('https://cdn.example.com/media/rawclip');
    expect(downloadAsync.mock.calls[0][1]).toBe('file:///cache/rawclip.mp4');
  });

  it('drops the query string rather than putting it in the filename', async () => {
    await saveMediaToDevice('https://cdn.example.com/a/clip.mp4?token=abc&x=1');
    expect(downloadAsync.mock.calls[0][1]).toBe('file:///cache/clip.mp4');
  });

  it('reports a failed download instead of sharing nothing', async () => {
    downloadAsync.mockResolvedValue({ uri: '', status: 404 });
    const result = await saveMediaToDevice(REMOTE);
    expect(result).toEqual({ ok: false, reason: 'Download failed (404).' });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it('does not download when the device cannot share the result', async () => {
    isAvailableAsync.mockResolvedValue(false);
    const result = await saveMediaToDevice(REMOTE);
    expect(result.ok).toBe(false);
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('turns a thrown error into a reason rather than propagating it', async () => {
    downloadAsync.mockRejectedValue(new Error('network down'));
    const result = await saveMediaToDevice(REMOTE);
    expect(result).toEqual({ ok: false, reason: 'network down' });
  });
});
