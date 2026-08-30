import { describe, it, expect } from 'vitest';
import {
  festivalOn,
  isBirthday,
  selectTrigger,
  copyForTrigger,
  type NudgeTrigger,
} from './triggerCopy';

// Deterministic picker so copy assertions are stable.
const first = <T,>(arr: T[]): T => arr[0];

describe('festivalOn', () => {
  it('matches a fixed-date national holiday regardless of year', () => {
    expect(festivalOn('2026-08-15')).toBe('Independence Day');
    expect(festivalOn('2031-08-15')).toBe('Independence Day');
  });

  it('matches a movable festival only on its exact dated entry', () => {
    expect(festivalOn('2026-11-08')).toBe('Diwali');
    // Same month/day in a year with no entry must NOT match — movable feasts
    // shift, and greeting the wrong day is worse than staying silent.
    expect(festivalOn('2030-11-08')).toBeNull();
  });

  it('returns null on an ordinary day', () => {
    expect(festivalOn('2026-06-11')).toBeNull();
  });
});

describe('isBirthday', () => {
  it('matches on month and day, ignoring birth year', () => {
    expect(isBirthday('1994-08-30', '2026-08-30')).toBe(true);
  });

  it('does not match a different day', () => {
    expect(isBirthday('1994-08-30', '2026-08-31')).toBe(false);
  });

  it('is false when the user has no date of birth', () => {
    expect(isBirthday(null, '2026-08-30')).toBe(false);
  });

  it('handles a 29 Feb birthday without matching 1 March', () => {
    expect(isBirthday('2000-02-29', '2026-03-01')).toBe(false);
    expect(isBirthday('2000-02-29', '2028-02-29')).toBe(true);
  });
});

describe('selectTrigger', () => {
  it('prefers birthday over everything else', () => {
    const t = selectTrigger({ dateOfBirth: '1994-11-08', today: '2026-11-08', surface: 'feed' });
    expect(t.kind).toBe('birthday');
  });

  it('prefers a festival over the surface default', () => {
    const t = selectTrigger({ dateOfBirth: null, today: '2026-08-15', surface: 'feed' });
    expect(t).toEqual<NudgeTrigger>({ kind: 'festival', name: 'Independence Day' });
  });

  it('falls back to the surface on an ordinary day', () => {
    const t = selectTrigger({ dateOfBirth: null, today: '2026-06-11', surface: 'tools' });
    expect(t).toEqual<NudgeTrigger>({ kind: 'surface', surface: 'tools' });
  });
});

describe('copyForTrigger', () => {
  it('returns birthday copy that does not pretend the app cares', () => {
    const body = copyForTrigger({ kind: 'birthday' }, first);
    expect(body).not.toBeNull();
    expect((body ?? '').length).toBeGreaterThan(0);
    expect(body ?? '').not.toMatch(/!/);
  });

  it('names the festival in the body', () => {
    const body = copyForTrigger({ kind: 'festival', name: 'Diwali' }, first);
    expect(body ?? '').toContain('Diwali');
  });

  it('returns null for a surface trigger so the caller uses SURFACE_COPY', () => {
    expect(copyForTrigger({ kind: 'surface', surface: 'feed' }, first)).toBeNull();
  });

  it('never emits an exclamation mark in any variant', () => {
    const triggers: NudgeTrigger[] = [{ kind: 'birthday' }, { kind: 'festival', name: 'Holi' }];
    for (const t of triggers) {
      for (let i = 0; i < 12; i++) {
        const body = copyForTrigger(t, arr => arr[i % arr.length]);
        expect(body ?? '').not.toMatch(/!/);
      }
    }
  });

  it('keeps every variant within the 16-word body budget', () => {
    const triggers: NudgeTrigger[] = [{ kind: 'birthday' }, { kind: 'festival', name: 'Diwali' }];
    for (const t of triggers) {
      for (let i = 0; i < 12; i++) {
        const body = copyForTrigger(t, arr => arr[i % arr.length]) ?? '';
        expect(body.trim().split(/\s+/).length).toBeLessThanOrEqual(16);
      }
    }
  });
});
