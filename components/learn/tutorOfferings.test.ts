import { describe, expect, it } from 'vitest';
import { parseTimeOfDay } from './timeOfDay';

/**
 * Availability is stored as a minute of the day, so the only thing between a
 * tutor typing "18:00" and a correct slot is this parser. A silent
 * misreading would put them down as free at the wrong hour.
 */
describe('parseTimeOfDay', () => {
  it('reads the ordinary forms', () => {
    expect(parseTimeOfDay('18:00')).toBe(18 * 60);
    expect(parseTimeOfDay('9:30')).toBe(9 * 60 + 30);
    expect(parseTimeOfDay('09:05')).toBe(9 * 60 + 5);
  });

  it('accepts an hour on its own, and tolerates spacing and dots', () => {
    expect(parseTimeOfDay('18')).toBe(18 * 60);
    expect(parseTimeOfDay(' 18 : 30 ')).toBe(18 * 60 + 30);
    expect(parseTimeOfDay('18.30')).toBe(18 * 60 + 30);
  });

  it('covers both ends of the day', () => {
    expect(parseTimeOfDay('00:00')).toBe(0);
    expect(parseTimeOfDay('23:59')).toBe(23 * 60 + 59);
  });

  it('refuses impossible times rather than wrapping them', () => {
    // 25:00 silently becoming 1am the next day is how someone ends up
    // advertising availability they never offered.
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('18:60')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('evening')).toBeNull();
    expect(parseTimeOfDay('18:5')).toBeNull();
  });
});
