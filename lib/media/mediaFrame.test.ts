import { describe, expect, it } from 'vitest';
import {
  clampPhotoAspect, isTabletPortrait, knownPhotoAspect, PHONE_MEDIA_HEIGHT, PHOTO_ASPECT_MAX, PHOTO_ASPECT_MIN,
  rememberPhotoAspect, singleMediaFrame, singlePhotoFrame,
} from './mediaFrame';

// 2026-11-25, iPhone: a 3:4 portrait in the fixed 240pt frame showed half the photo.
describe('single photo frame', () => {
  it('shows a 3:4 portrait whole and clamps phone-tall and panorama shots', () => {
    expect(clampPhotoAspect(960, 1280)).toBeCloseTo(0.75); // the reported photo, uncut
    expect(clampPhotoAspect(1080, 1920)).toBe(PHOTO_ASPECT_MIN);
    expect(clampPhotoAspect(4000, 1000)).toBe(PHOTO_ASPECT_MAX);
    expect(clampPhotoAspect(1600, 1200)).toBeCloseTo(4 / 3);
    expect(clampPhotoAspect(0, 100)).toBeUndefined();
  });

  it('uses the learned shape on a phone, and the fixed height until it is known', () => {
    expect(singlePhotoFrame(390, 844, undefined)).toEqual({ height: PHONE_MEDIA_HEIGHT });
    expect(singlePhotoFrame(390, 844, 0.8)).toEqual({ width: '100%', aspectRatio: 0.8 });
    expect(singlePhotoFrame(820, 1180, 0.8)).toEqual(singleMediaFrame(820, 1180));
  });

  it('remembers a shape per URI for the next render of the same photo', () => {
    expect(knownPhotoAspect('https://x/a.jpg')).toBeUndefined();
    expect(rememberPhotoAspect('https://x/a.jpg', 1080, 1350)).toBeCloseTo(0.8);
    expect(knownPhotoAspect('https://x/a.jpg')).toBeCloseTo(0.8);
    expect(knownPhotoAspect('https://x/b.jpg')).toBeUndefined();
  });
});

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
