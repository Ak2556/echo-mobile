import { beforeEach, describe, expect, it, vi } from 'vitest';

// 2026-11-26: one of kavish's clips keeps its index (moov) at the end of the
// file. Android read only the first megabyte, found no index, and the tile
// stayed black. The poster now fetches more of such a clip once.

const fs = vi.hoisted(() => ({
  files: new Map<string, number>(),
  downloads: [] as string[],
}));
const frames = vi.hoisted(() => ({ readable: (_size: number): boolean => true }));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async (p: string) => (fs.files.has(p) ? { exists: true, size: fs.files.get(p) } : { exists: false }),
  downloadAsync: async (_uri: string, p: string, o: { headers: { Range: string } }) => {
    fs.downloads.push(o.headers.Range);
    const end = Number(/bytes=0-(\d+)/.exec(o.headers.Range)![1]);
    fs.files.set(p, Math.min(end + 1, 8_804_819));
    return { status: 206 };
  },
  deleteAsync: async (p: string) => { fs.files.delete(p); },
}));
vi.mock('./echoMedia', () => ({
  canReadFrames: () => true,
  frameAt: async (path: string) => {
    if (!frames.readable(fs.files.get(path) ?? 0)) throw new Error('no moov');
    return 'file:///cache/frame.jpg';
  },
}));

const { loadVideoPoster } = await import('./videoPoster');

beforeEach(() => {
  fs.files.clear();
  fs.downloads.length = 0;
});

describe('Android video poster', () => {
  it('reads a frame from the first megabyte when the index is at the front', async () => {
    frames.readable = () => true;
    expect(await loadVideoPoster('https://x.dev/front.mp4')).toEqual({ uri: 'file:///cache/frame.jpg' });
    expect(fs.downloads).toEqual(['bytes=0-1048575']);
  });

  it('fetches the whole clip once when the index is at the end', async () => {
    // The clip is 8.8 MB with moov last: only the whole file has it.
    frames.readable = (size) => size >= 8_804_819;
    expect(await loadVideoPoster('https://x.dev/moov-at-end.mp4')).toEqual({ uri: 'file:///cache/frame.jpg' });
    expect(fs.downloads).toEqual(['bytes=0-1048575', `bytes=0-${25 * 1024 * 1024 - 1}`]);
  });

  it('gives up, and keeps nothing, when no frame can be read at all', async () => {
    frames.readable = () => false;
    expect(await loadVideoPoster('https://x.dev/broken.mp4')).toBeNull();
    expect(fs.files.size).toBe(0);
  });
});
