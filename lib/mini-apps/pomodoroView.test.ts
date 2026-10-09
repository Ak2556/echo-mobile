import { describe, expect, it } from 'vitest';
import { progressSummary, showFocusPresets, showStageRail } from './pomodoroView';

describe('showStageRail', () => {
  it('is hidden before a session starts, when it can only say "Settle"', () => {
    expect(showStageRail(false, 0)).toBe(false);
  });
  it('shows while running, and while paused part-way', () => {
    expect(showStageRail(true, 0)).toBe(true);
    expect(showStageRail(true, 40)).toBe(true);
    expect(showStageRail(false, 40)).toBe(true);
  });
});

describe('showFocusPresets', () => {
  it('shows on the idle Focus tab only', () => {
    expect(showFocusPresets('focus', false)).toBe(true);
    expect(showFocusPresets('focus', true)).toBe(false);
    expect(showFocusPresets('short', false)).toBe(false);
    expect(showFocusPresets('long', false)).toBe(false);
  });
});

describe('progressSummary', () => {
  it('says how many sessions today', () => {
    expect(progressSummary(0, 8, 0)).toBe('0/8');
    expect(progressSummary(3, 8, 0)).toBe('3/8');
  });
  it('adds the streak once there is one', () => {
    expect(progressSummary(3, 8, 4)).toBe('3/8 · 4d streak');
  });
});
