import { describe, expect, it } from 'vitest';
import {
  FILTER_PRESETS,
  IDENTITY,
  NO_ADJUST,
  finalMatrix,
  hasAdjustments,
} from './photoFilters';

function sameMatrix(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
}

describe('photo filter matrices', () => {
  it('makes every named filter except Original change pixels', () => {
    for (const preset of FILTER_PRESETS) {
      const matrix = finalMatrix(preset.key, NO_ADJUST);
      expect(matrix).toHaveLength(20);
      if (preset.key === 'none') {
        expect(sameMatrix(matrix, IDENTITY)).toBe(true);
      } else {
        expect(sameMatrix(matrix, IDENTITY)).toBe(false);
      }
    }
  });

  it('detects adjustment sliders as real edits', () => {
    expect(hasAdjustments(NO_ADJUST)).toBe(false);
    expect(hasAdjustments({ ...NO_ADJUST, contrast: 0.25 })).toBe(true);
    expect(sameMatrix(finalMatrix('none', { ...NO_ADJUST, contrast: 0.25 }), IDENTITY)).toBe(false);
  });
});
