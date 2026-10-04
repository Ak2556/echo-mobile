import { describe, expect, it } from 'vitest';
import { playbackEnded } from './audioPlayback';

const status = (over: Partial<Parameters<typeof playbackEnded>[0]> = {}) => ({
  didJustFinish: false, loop: false, playbackState: 'ready', playing: true, duration: 3, currentTime: 1, ...over,
});

describe('playbackEnded', () => {
  it('trusts didJustFinish when it arrives', () => {
    expect(playbackEnded(status({ didJustFinish: true }))).toBe(true);
  });

  it('catches the end without didJustFinish', () => {
    expect(playbackEnded(status({ playbackState: 'ended', playing: false }))).toBe(true);
    expect(playbackEnded(status({ playing: false, currentTime: 2.95 }))).toBe(true);
  });

  it('is not fooled by a pause mid-track, loading, or a loop', () => {
    expect(playbackEnded(status({ playing: false, currentTime: 1.2 }))).toBe(false);
    expect(playbackEnded(status({ playing: false, duration: 0, currentTime: 0 }))).toBe(false);
    expect(playbackEnded(status({ loop: true, playing: false, currentTime: 3 }))).toBe(false);
    expect(playbackEnded(status())).toBe(false);
  });
});
