import { describe, expect, it } from 'vitest';
import { washOpacity } from './edgeGlassRamp';

/**
 * The tab bar sits over whatever the feed last scrolled to, which is usually a
 * photo, and six small labels have to stay readable against it. At the header's
 * wash value they did not — Flow, Chat and Tools vanished into a sunlit wall.
 *
 * Headers keep the lower value on purpose: content approaching from one edge
 * under a wide title is a much easier case, and raising it there would dull the
 * one surface where the treatment already reads correctly.
 */
describe('washOpacity', () => {
  it('leaves headers where they were', () => {
    expect(washOpacity(true)).toBeCloseTo(0.55);
    expect(washOpacity(false)).toBeCloseTo(0.6);
  });

  it('is stronger for chrome that sits over arbitrary content', () => {
    expect(washOpacity(true, 'strong')).toBeGreaterThan(washOpacity(true));
    expect(washOpacity(false, 'strong')).toBeGreaterThan(washOpacity(false));
  });

  it('raises it enough to hold small text', () => {
    // Below ~0.7 in dark, label contrast against a bright photo is not reliable.
    expect(washOpacity(true, 'strong')).toBeGreaterThanOrEqual(0.7);
  });

  it('never becomes an opaque bar', () => {
    // Past this the glass stops being glass and the content no longer shows
    // through at all, which is the thing EdgeGlass exists to avoid.
    for (const dark of [true, false]) {
      expect(washOpacity(dark, 'strong')).toBeLessThanOrEqual(0.95);
      expect(washOpacity(dark, 'strong')).toBeLessThan(1);
    }
  });
});
