import { describe, expect, it } from 'vitest';
import { formatClock, isWholeClip, MIN_TRIM_MS, moveEnd, moveStart } from './trimRange';

const D = 10_000;

describe('trim range', () => {
  it('start cannot pass the end minus the minimum length', () => {
    expect(moveStart(9_900, { startMs: 0, endMs: 5_000 }, D)).toEqual({ startMs: 5_000 - MIN_TRIM_MS, endMs: 5_000 });
  });

  it('start cannot go below zero', () => {
    expect(moveStart(-400, { startMs: 2_000, endMs: 8_000 }, D).startMs).toBe(0);
  });

  it('end cannot pass the clip or come within the minimum of the start', () => {
    expect(moveEnd(99_000, { startMs: 0, endMs: 5_000 }, D).endMs).toBe(D);
    expect(moveEnd(100, { startMs: 3_000, endMs: 8_000 }, D).endMs).toBe(3_000 + MIN_TRIM_MS);
  });

  it('a clip shorter than the minimum can still be kept whole', () => {
    expect(moveEnd(500, { startMs: 0, endMs: 400 }, 400)).toEqual({ startMs: 0, endMs: 400 });
    expect(moveStart(300, { startMs: 0, endMs: 400 }, 400)).toEqual({ startMs: 0, endMs: 400 });
  });

  it('knows when nothing has been trimmed', () => {
    expect(isWholeClip({ startMs: 0, endMs: D }, D)).toBe(true);
    expect(isWholeClip({ startMs: 100, endMs: D }, D)).toBe(false);
    expect(isWholeClip({ startMs: 0, endMs: D - 100 }, D)).toBe(false);
  });

  it('formats minutes, seconds and tenths', () => {
    expect(formatClock(0)).toBe('0:00.0');
    expect(formatClock(65_400)).toBe('1:05.4');
    expect(formatClock(-5)).toBe('0:00.0');
  });
});
