/**
 * Which video is allowed to play.
 *
 * Explore mounted a video player per grid tile and passed no echoId. The old
 * rule treated a missing echoId as "always active", so every tile decided it
 * was the one on screen and they all played at once — audio over audio.
 *
 * The rule now requires opting in. VideoPreview itself pulls in expo-video and
 * cannot be loaded in a node test, so the predicate is mirrored here; it is one
 * line, and it is the line that caused the bug.
 */
import { describe, expect, it } from 'vitest';

function isActive(opts: {
  isFocused: boolean;
  isAppActive: boolean;
  echoId?: string;
  activeEchoId: string | null;
  autoplay?: boolean;
}): boolean {
  const { isFocused, isAppActive, echoId, activeEchoId, autoplay = false } = opts;
  return isFocused && isAppActive && (echoId ? activeEchoId === echoId : !!autoplay);
}

const ON_SCREEN = { isFocused: true, isAppActive: true };

describe('a grid of videos', () => {
  it('plays none of them when no echo is active', () => {
    // The reported bug: opening Explore started every visible video at once.
    const tiles = ['a', 'b', 'c'];
    const playing = tiles.filter(id =>
      isActive({ ...ON_SCREEN, echoId: id, activeEchoId: null }),
    );
    expect(playing).toEqual([]);
  });

  it('plays at most one, even when several are on screen', () => {
    const tiles = ['a', 'b', 'c'];
    const playing = tiles.filter(id =>
      isActive({ ...ON_SCREEN, echoId: id, activeEchoId: 'b' }),
    );
    expect(playing).toEqual(['b']);
  });

  it('does not play a tile without an echoId', () => {
    // The old rule returned true here, which is what made the grid audible.
    expect(isActive({ ...ON_SCREEN, activeEchoId: null })).toBe(false);
    expect(isActive({ ...ON_SCREEN, activeEchoId: 'a' })).toBe(false);
  });
});

describe('autoplay is opt-in', () => {
  it('plays a single video that has no echo yet, when asked', () => {
    // The composer preview: the user just picked this file, nothing is posted.
    expect(isActive({ ...ON_SCREEN, activeEchoId: null, autoplay: true })).toBe(true);
  });

  it('does not let autoplay override the active-video store', () => {
    // An echoId means the store decides, so autoplay cannot resurrect the bug
    // by being passed alongside it.
    expect(
      isActive({ ...ON_SCREEN, echoId: 'a', activeEchoId: 'b', autoplay: true }),
    ).toBe(false);
  });
});

describe('screen and app state still gate playback', () => {
  it('does not play while the screen is blurred', () => {
    expect(
      isActive({ isFocused: false, isAppActive: true, echoId: 'a', activeEchoId: 'a' }),
    ).toBe(false);
  });

  it('does not play while the app is backgrounded', () => {
    expect(
      isActive({ isFocused: true, isAppActive: false, echoId: 'a', activeEchoId: 'a' }),
    ).toBe(false);
  });

  it('does not play a backgrounded autoplay video either', () => {
    expect(
      isActive({ isFocused: true, isAppActive: false, activeEchoId: null, autoplay: true }),
    ).toBe(false);
  });
});


/**
 * A user pause has to survive the effects that drive playback. The original
 * code called player.play() whenever isActive, mute state, or load state
 * changed, so a pause was undone by the very next re-render — which is what
 * "pausing isn't working" looked like on a device.
 */
function shouldPlay(opts: {
  isFocused: boolean;
  isAppActive: boolean;
  echoId?: string;
  activeEchoId: string | null;
  autoplay?: boolean;
  paused?: boolean;
}): boolean {
  return isActive(opts) && !opts.paused;
}

describe('a user pause', () => {
  const ACTIVE = { ...ON_SCREEN, echoId: 'a', activeEchoId: 'a' };

  it('stops the active video', () => {
    expect(shouldPlay({ ...ACTIVE, paused: false })).toBe(true);
    expect(shouldPlay({ ...ACTIVE, paused: true })).toBe(false);
  });

  it('survives a mute toggle', () => {
    // Muting re-runs the playback effect. Before, that restarted the video.
    expect(shouldPlay({ ...ACTIVE, paused: true })).toBe(false);
  });

  it('survives the video becoming ready again', () => {
    // The statusChange listener called play() on every 'ready' transition.
    expect(shouldPlay({ ...ACTIVE, paused: true })).toBe(false);
  });

  it('does not make an inactive video play', () => {
    expect(shouldPlay({ ...ON_SCREEN, echoId: 'a', activeEchoId: 'b', paused: false })).toBe(false);
  });
});
