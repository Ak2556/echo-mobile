import { describe, expect, it } from 'vitest';
import { isTabletPortrait, PHONE_MEDIA_HEIGHT, singleMediaFrame } from './mediaFrame';

describe('single media frame', () => {
  it('is a fixed height on a phone and on a landscape iPad', () => {
    expect(singleMediaFrame(390, 844)).toEqual({ height: PHONE_MEDIA_HEIGHT });
    expect(singleMediaFrame(1180, 820)).toEqual({ height: PHONE_MEDIA_HEIGHT });
  });

  it('is 3:4, capped at 62% of the screen, on an iPad held upright', () => {
    expect(isTabletPortrait(820, 1180)).toBe(true);
    expect(singleMediaFrame(820, 1180)).toEqual({ width: '100%', aspectRatio: 3 / 4, maxHeight: 1180 * 0.62 });
  });

  it('honours a different fixed height for callers that need one', () => {
    expect(singleMediaFrame(390, 844, 180)).toEqual({ height: 180 });
  });
});
