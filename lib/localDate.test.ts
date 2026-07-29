import { describe, it, expect } from 'vitest';
import { localDayKey, shiftDayKey } from './localDate';

describe('localDayKey', () => {
  it('formats a Date as its LOCAL Y-M-D (not UTC)', () => {
    // Constructed from local components → must read back the same local day,
    // regardless of the machine timezone.
    const d = new Date(2026, 6, 29, 12, 0, 0); // 29 Jul 2026, local noon
    expect(localDayKey(d)).toBe('2026-07-29');
  });

  it('zero-pads month and day', () => {
    expect(localDayKey(new Date(2026, 0, 3, 9, 0, 0))).toBe('2026-01-03');
  });

  it('reflects the local day even at times that differ from the UTC day', () => {
    // Local components define the day; the helper never round-trips through UTC.
    const d = new Date(2026, 11, 31, 23, 30, 0); // 31 Dec 2026 local, late night
    expect(localDayKey(d)).toBe('2026-12-31');
  });
});

describe('shiftDayKey', () => {
  it('walks back a day', () => {
    expect(shiftDayKey('2026-07-29', -1)).toBe('2026-07-28');
  });
  it('crosses month boundaries', () => {
    expect(shiftDayKey('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDayKey('2026-07-31', 1)).toBe('2026-08-01');
  });
  it('crosses year boundaries', () => {
    expect(shiftDayKey('2027-01-01', -1)).toBe('2026-12-31');
  });
});
