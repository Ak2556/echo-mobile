import { describe, expect, it, vi } from 'vitest';
import { buildActions, dispatch, type GestureCardAction } from './gestureCardA11y';

const action = (id: string, label: string): GestureCardAction => ({
  id,
  label,
  run: vi.fn(),
});

describe('buildActions', () => {
  it('publishes every bound gesture to the rotor', () => {
    // The guarantee: a gesture-only action is unreachable for a screen reader,
    // so nothing bound may be missing here.
    const like = action('like', 'Like');
    const save = action('save', 'Save');
    const more = action('more', 'More actions');

    expect(buildActions([like, save, more])).toEqual([
      { name: 'like', label: 'Like' },
      { name: 'save', label: 'Save' },
      { name: 'more', label: 'More actions' },
    ]);
  });

  it('skips gestures that are not bound', () => {
    const like = action('like', 'Like');
    expect(buildActions([like, undefined, null])).toEqual([{ name: 'like', label: 'Like' }]);
  });

  it('lists an action once even when two gestures share it', () => {
    // Double-tap and swipe-right both meaning "like" is the normal case.
    const like = action('like', 'Like');
    expect(buildActions([like, like])).toHaveLength(1);
  });

  it('returns nothing when no gesture is bound', () => {
    expect(buildActions([undefined, null])).toEqual([]);
  });
});

describe('dispatch', () => {
  it('runs the action matching the name', () => {
    const like = action('like', 'Like');
    const save = action('save', 'Save');

    expect(dispatch('save', [like, save])).toBe(true);
    expect(save.run).toHaveBeenCalledTimes(1);
    expect(like.run).not.toHaveBeenCalled();
  });

  it('reports when nothing matched, rather than failing silently', () => {
    const like = action('like', 'Like');
    expect(dispatch('report', [like])).toBe(false);
    expect(like.run).not.toHaveBeenCalled();
  });

  it('tolerates unbound entries', () => {
    const like = action('like', 'Like');
    expect(dispatch('like', [undefined, like, null])).toBe(true);
    expect(like.run).toHaveBeenCalledTimes(1);
  });

  it('runs only the first match', () => {
    const a = action('like', 'Like');
    const b = action('like', 'Like again');
    dispatch('like', [a, b]);
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(b.run).not.toHaveBeenCalled();
  });
});

describe('gesture/rotor parity', () => {
  it('every gesture a card binds is reachable without gestures', () => {
    // Mirrors how GestureCard wires itself: whatever set of gestures a card
    // binds, the rotor must expose the same set.
    const bindings = {
      swipeRight: action('like', 'Like'),
      swipeLeft: action('save', 'Save'),
      doubleTap: action('like', 'Like'),
      longPress: action('more', 'More actions'),
    };
    const candidates = [
      bindings.swipeRight,
      bindings.swipeLeft,
      bindings.doubleTap,
      bindings.longPress,
    ];

    const published = buildActions(candidates).map(a => a.name);
    const bound = [...new Set(candidates.map(a => a.id))];

    expect(published.sort()).toEqual(bound.sort());
    for (const name of bound) {
      expect(dispatch(name, candidates)).toBe(true);
    }
  });
});
