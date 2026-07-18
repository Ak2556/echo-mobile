import { describe, it, expect } from 'vitest';
import { computeDayStreak, utcDayKey } from './dailyStreak';

const TODAY = '2026-07-18';
const d = (k: string) => k; // readability alias for day keys

describe('computeDayStreak', () => {
  it('is 0 with no answers', () => {
    expect(computeDayStreak([], TODAY)).toBe(0);
  });

  it('counts a single answer today', () => {
    expect(computeDayStreak([d('2026-07-18')], TODAY)).toBe(1);
  });

  it('keeps the streak alive on an unanswered today if yesterday is answered', () => {
    expect(computeDayStreak([d('2026-07-17'), d('2026-07-16')], TODAY)).toBe(2);
  });

  it('counts an unbroken run ending today', () => {
    expect(computeDayStreak(
      ['2026-07-18', '2026-07-17', '2026-07-16', '2026-07-15'],
      TODAY,
    )).toBe(4);
  });

  it('breaks when the newest answer is older than yesterday', () => {
    expect(computeDayStreak(['2026-07-16', '2026-07-15'], TODAY)).toBe(0);
  });

  it('stops at the first gap', () => {
    // today, yesterday, then a gap at 07-16
    expect(computeDayStreak(
      ['2026-07-18', '2026-07-17', '2026-07-15', '2026-07-14'],
      TODAY,
    )).toBe(2);
  });

  it('dedupes duplicate day keys', () => {
    expect(computeDayStreak(
      ['2026-07-18', '2026-07-18', '2026-07-17'],
      TODAY,
    )).toBe(2);
  });

  it('crosses a month boundary correctly', () => {
    expect(computeDayStreak(
      ['2026-07-01', '2026-06-30', '2026-06-29'],
      '2026-07-01',
    )).toBe(3);
  });

  it('utcDayKey formats YYYY-MM-DD', () => {
    expect(utcDayKey(new Date('2026-07-18T15:30:00Z'))).toBe('2026-07-18');
  });
});
