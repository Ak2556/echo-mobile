import { describe, expect, it } from 'vitest';
import { resist, decideSwipe, DEFAULT_SWIPE } from './gestureCardSwipe';

const C = DEFAULT_SWIPE;

describe('resist', () => {
  it('tracks the finger exactly up to the commit threshold', () => {
    // The point where a release would fire is the point the card stops keeping
    // up — that correspondence is what makes the gesture legible.
    expect(resist(0)).toBe(0);
    expect(resist(40)).toBe(40);
    expect(resist(C.threshold)).toBe(C.threshold);
    expect(resist(-C.threshold)).toBe(-C.threshold);
  });

  it('compresses travel beyond the threshold', () => {
    const past = resist(C.threshold + 40);
    expect(past).toBeGreaterThan(C.threshold);
    expect(past).toBeLessThan(C.threshold + 40);
  });

  it('never exceeds maxTravel, however hard it is dragged', () => {
    // maxTravel is an asymptote, so a hard enough drag lands exactly on it.
    for (const dx of [200, 600, 5000]) {
      expect(resist(dx)).toBeLessThanOrEqual(C.maxTravel);
      expect(resist(-dx)).toBeGreaterThanOrEqual(-C.maxTravel);
    }
  });

  it('is symmetric', () => {
    for (const dx of [10, 78, 150, 400]) {
      expect(resist(-dx)).toBeCloseTo(-resist(dx), 6);
    }
  });
});

describe('decideSwipe', () => {
  it('commits once dragged past the threshold', () => {
    expect(decideSwipe(C.threshold, 0)).toBe('right');
    expect(decideSwipe(-C.threshold, 0)).toBe('left');
    expect(decideSwipe(200, 0)).toBe('right');
  });

  it('does nothing for a short, slow drag', () => {
    expect(decideSwipe(20, 0)).toBe('none');
    expect(decideSwipe(-20, 100)).toBe('none');
  });

  it('commits on a fast flick that has covered some ground', () => {
    const halfway = C.threshold * 0.6;
    expect(decideSwipe(halfway, C.velocity + 100)).toBe('right');
    expect(decideSwipe(-halfway, -(C.velocity + 100))).toBe('left');
  });

  it('ignores a fast flick that has barely moved', () => {
    // The vertical fling that scrolls a feed picks up a little sideways drift at
    // high speed. That must never fire an action.
    expect(decideSwipe(6, 2000)).toBe('none');
    expect(decideSwipe(-6, -2000)).toBe('none');
  });

  it('ignores velocity pointing back the way it came', () => {
    // Dragged right, now flicking left: the user is putting the card back.
    expect(decideSwipe(C.threshold * 0.6, -2000)).toBe('none');
    expect(decideSwipe(-C.threshold * 0.6, 2000)).toBe('none');
  });

  it('lets distance win even when velocity disagrees', () => {
    expect(decideSwipe(C.threshold + 10, -2000)).toBe('right');
  });
});
