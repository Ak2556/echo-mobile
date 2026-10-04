import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
vi.mock('./echoMedia', () => ({ canReadFrames: () => false, frameAt: async () => '' }));

const { posterFileName } = await import('./videoPoster');

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
