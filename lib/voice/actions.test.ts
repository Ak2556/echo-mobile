import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVoiceActions,
  getVoiceActions,
  registerVoiceActions,
} from './actions';

/**
 * The registry used to be one mutable object that every screen merged into, and
 * screens registered on MOUNT. Tab screens do not unmount when you leave them,
 * so the home feed's handlers stayed live while the user was on Explore —
 * "like this" acted on a post they were not looking at, with nothing on screen
 * to say so. These pin the behaviour that replaced it.
 */
describe('voice action registry', () => {
  beforeEach(() => clearVoiceActions());

  it('gives the dispatcher nothing when no screen is focused', () => {
    expect(getVoiceActions()).toEqual({});
  });

  it('serves the most recently focused screen', () => {
    const home = vi.fn(() => true);
    const explore = vi.fn(() => true);
    registerVoiceActions('home', { postAction: home });
    registerVoiceActions('explore', { postAction: explore });

    getVoiceActions().postAction?.('like');
    expect(explore).toHaveBeenCalledOnce();
    expect(home).not.toHaveBeenCalled();
  });

  it('does not merge one screen into another', () => {
    // The old registry did `handlers = { ...handlers, ...h }`, so a screen that
    // registered only `scroll` inherited the previous screen's `postAction`.
    const homePost = vi.fn(() => true);
    registerVoiceActions('home', { postAction: homePost, refresh: vi.fn() });
    registerVoiceActions('explore', { scroll: vi.fn() });

    expect(getVoiceActions().postAction).toBeUndefined();
    expect(getVoiceActions().refresh).toBeUndefined();
    getVoiceActions().postAction?.('like');
    expect(homePost).not.toHaveBeenCalled();
  });

  it('falls back to nothing when the focused screen blurs', () => {
    const home = vi.fn(() => true);
    const explore = vi.fn(() => true);
    registerVoiceActions('home', { postAction: home });
    registerVoiceActions('explore', { postAction: explore });

    clearVoiceActions('explore');

    // Deliberately NOT home: a stale action is worse than no action, because
    // the user cannot see which screen it landed on.
    expect(getVoiceActions()).toEqual({});
    getVoiceActions().postAction?.('like');
    expect(home).not.toHaveBeenCalled();
  });

  it('keeps a blurred screen out of the way without losing the focused one', () => {
    const explore = vi.fn(() => true);
    registerVoiceActions('home', { postAction: vi.fn(() => true) });
    registerVoiceActions('explore', { postAction: explore });

    clearVoiceActions('home');

    getVoiceActions().postAction?.('like');
    expect(explore).toHaveBeenCalledOnce();
  });
});
