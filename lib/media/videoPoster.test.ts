import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
vi.mock('./echoMedia', () => ({ canReadFrames: () => false, frameAt: async () => '' }));

const { firstThumbnail, posterFileName } = await import('./videoPoster');

describe('posterFileName', () => {
  it('is stable for a uri and different between uris', () => {
    const a = 'https://x.dev/media/a_video.mp4';
    expect(posterFileName(a)).toBe(posterFileName(a));
    expect(posterFileName(a)).not.toBe(posterFileName('https://x.dev/media/b_video.mp4'));
  });

  it('is a safe file name', () => {
    expect(posterFileName('https://x.dev/a b/c?d=e&f#g')).toMatch(/^poster_[0-9a-z]+\.mp4$/);
  });
});

// 2026-11-26: on iOS the first ask always returned [] (the player had not loaded
// its source yet), so every video tile was black.
describe('firstThumbnail', () => {
  const noSleep = async () => {};

  it('keeps asking until the player has a frame', async () => {
    let calls = 0;
    const generate = async () => (++calls < 4 ? [] : ['frame']);
    expect(await firstThumbnail(generate, 20, 250, noSleep)).toBe('frame');
    expect(calls).toBe(4);
  });

  it('gives up after the last attempt', async () => {
    let calls = 0;
    const generate = async () => { calls++; return [] as string[]; };
    expect(await firstThumbnail(generate, 5, 250, noSleep)).toBeNull();
    expect(calls).toBe(5);
  });
});
