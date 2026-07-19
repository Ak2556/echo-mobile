import { describe, it, expect } from 'vitest';
import {
  IDENTITY, compose, composeAll, isIdentity, brightness, saturation, contrast,
  adjustmentsToMatrix, NO_ADJUST, hasAdjustments, finalMatrix, presetMatrix,
} from './photoFilters';

describe('color matrices', () => {
  it('identity is identity', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(brightness(0))).toBe(true);
    expect(isIdentity(saturation(0))).toBe(true);
    expect(isIdentity(contrast(0))).toBe(true);
  });

  it('composing with identity is a no-op', () => {
    const b = brightness(0.5);
    expect(compose(b, IDENTITY)).toEqual(b);
    expect(compose(IDENTITY, b)).toEqual(b);
  });

  it('adjustmentsToMatrix with no adjustments is identity', () => {
    expect(isIdentity(adjustmentsToMatrix(NO_ADJUST))).toBe(true);
  });

  it('saturation(-1) makes every output channel the same luminance mix', () => {
    const m = saturation(-1); // grayscale: each row should equal the luma weights
    // Row R, G, B first three coeffs should all be [0.2126, 0.7152, 0.0722].
    expect(m.slice(0, 3)).toEqual([0.2126, 0.7152, 0.0722]);
    expect(m.slice(5, 8)).toEqual([0.2126, 0.7152, 0.0722]);
    expect(m.slice(10, 13)).toEqual([0.2126, 0.7152, 0.0722]);
  });

  it('brightness pushes the offset column', () => {
    const m = brightness(1);
    expect(m[4]).toBeCloseTo(0.35, 5);
    expect(m[9]).toBeCloseTo(0.35, 5);
    expect(m[14]).toBeCloseTo(0.35, 5);
  });

  it('hasAdjustments detects any non-zero', () => {
    expect(hasAdjustments(NO_ADJUST)).toBe(false);
    expect(hasAdjustments({ ...NO_ADJUST, contrast: 0.2 })).toBe(true);
  });

  it('finalMatrix(none, no-adjust) is identity; a preset is not', () => {
    expect(isIdentity(finalMatrix('none', NO_ADJUST))).toBe(true);
    expect(isIdentity(presetMatrix('vivid'))).toBe(false);
    expect(isIdentity(finalMatrix('mono', NO_ADJUST))).toBe(false);
  });

  it('composeAll folds left-to-right without throwing on many matrices', () => {
    const m = composeAll(brightness(0.1), contrast(0.1), saturation(0.1));
    expect(m).toHaveLength(20);
  });
});
