import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({ Platform: platform }));

import { capFeedBuffer, FEED_BUFFER } from './playerBuffer';

describe('capFeedBuffer', () => {
  beforeEach(() => { platform.OS = 'android'; });

  it('caps the buffer in time and in bytes on Android', () => {
    const player = { bufferOptions: {} };
    capFeedBuffer(player);
    expect(player.bufferOptions).toEqual(FEED_BUFFER);
    expect(FEED_BUFFER.maxBufferBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it('leaves iOS alone', () => {
    platform.OS = 'ios';
    const player = { bufferOptions: { untouched: true } };
    capFeedBuffer(player);
    expect(player.bufferOptions).toEqual({ untouched: true });
  });

  it('does not throw when the native build has no bufferOptions', () => {
    const player = Object.defineProperty({}, 'bufferOptions', { set() { throw new Error('unsupported'); } }) as { bufferOptions: object };
    expect(() => capFeedBuffer(player)).not.toThrow();
  });
});

// The helper only helps if the feed players call it. A new feed player that forgets it brings the
// out-of-memory crash back, so this reads the source.
describe('feed players cap their buffers', () => {
  for (const file of ['components/feed/VideoPreview.tsx', 'components/feed/InlineVideo.tsx']) {
    it(`${file} uses capFeedBuffer`, () => {
      const src = readFileSync(join(__dirname, '..', '..', file), 'utf8');
      // the import, plus at least one use (called, or handed to useVideoPlayer as its setup callback)
      expect(src.match(/\bcapFeedBuffer\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
  }
});
