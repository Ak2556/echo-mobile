import { describe, it, expect } from 'vitest';
import {
  emptyModel, recordOpen, recordNudgeSent, recordNudgeOpened, reconcileNudges,
  topActiveHours, topSurface, isQuietHour, shouldSendNudge, plannedNudgeHours,
  DEFAULT_POLICY,
} from './engagementModel';

const at = (dayHour: string) => new Date(`2026-07-18T${dayHour}:00:00`);

describe('recordOpen / learning', () => {
  it('accumulates hour weight and clears ignored streak', () => {
    let m = emptyModel();
    m.ignoredStreak = 5;
    m = recordOpen(m, at('09'), 'daily');
    expect(m.hours[9]).toBeGreaterThan(0);
    expect(m.surfaces.daily).toBe(1);
    expect(m.ignoredStreak).toBe(0);
  });

  it('applies daily decay only once per calendar day', () => {
    let m = emptyModel();
    m = recordOpen(m, new Date('2026-07-18T09:00:00'), 'feed');
    const before = m.hours[9];
    m = recordOpen(m, new Date('2026-07-18T09:30:00'), 'feed'); // same day, no decay
    expect(m.hours[9]).toBeCloseTo(before + 1, 5);
    m = recordOpen(m, new Date('2026-07-19T09:00:00'), 'feed'); // next day, decay then +1
    // prior weight (~2) decayed by 0.9 then +1 ⇒ ~2.8
    expect(m.hours[9]).toBeCloseTo(2 * 0.9 + 1, 5);
  });
});

describe('topActiveHours', () => {
  it('falls back to defaults with little signal', () => {
    expect(topActiveHours(emptyModel(), 2)).toEqual([9, 19]);
  });

  it('surfaces the busiest hours once there is signal', () => {
    let m = emptyModel();
    for (let i = 0; i < 4; i++) m = recordOpen(m, at('07'));
    for (let i = 0; i < 6; i++) m = recordOpen(m, at('21'));
    for (let i = 0; i < 2; i++) m = recordOpen(m, at('13'));
    expect(topActiveHours(m, 2)).toEqual([7, 21]); // top two, returned sorted asc
  });
});

describe('topSurface', () => {
  it('returns null with no data and the leader otherwise', () => {
    expect(topSurface(emptyModel())).toBeNull();
    let m = emptyModel();
    m = recordOpen(m, at('09'), 'dm');
    m = recordOpen(m, at('10'), 'dm');
    m = recordOpen(m, at('11'), 'feed');
    expect(topSurface(m)).toBe('dm');
  });
});

describe('quiet hours', () => {
  it('handles the midnight-wrapping window', () => {
    expect(isQuietHour(23, DEFAULT_POLICY)).toBe(true);
    expect(isQuietHour(3, DEFAULT_POLICY)).toBe(true);
    expect(isQuietHour(8, DEFAULT_POLICY)).toBe(false);
    expect(isQuietHour(14, DEFAULT_POLICY)).toBe(false);
  });
});

describe('shouldSendNudge guardrails', () => {
  it('blocks during quiet hours', () => {
    expect(shouldSendNudge(emptyModel(), at('23')).send).toBe(false);
  });

  it('enforces the daily cap', () => {
    let m = emptyModel();
    m = recordNudgeSent(m, at('09'));
    m = recordNudgeSent(m, at('12'));
    expect(m.nudgeCountToday).toBe(2);
    expect(shouldSendNudge(m, at('15')).reason).toBe('daily-cap');
  });

  it('halves the cap after repeated ignores', () => {
    let m = emptyModel();
    m.ignoredStreak = 3; // >= backOffAfterIgnored
    m = recordNudgeSent(m, at('09')); // ignoredStreak now 4, count 1
    // cap halved from 2 → 1, already sent 1 today ⇒ blocked
    expect(shouldSendNudge(m, at('12')).reason).toBe('daily-cap');
  });

  it('resets ignored streak when a nudge is opened', () => {
    let m = emptyModel();
    m = recordNudgeSent(m, at('09'));
    m = recordNudgeSent(m, at('10'));
    expect(m.ignoredStreak).toBe(2);
    m = recordNudgeOpened(m);
    expect(m.ignoredStreak).toBe(0);
    expect(m.notifOpened).toBe(1);
  });
});

describe('plannedNudgeHours', () => {
  it('caps to policy and strips quiet hours', () => {
    let m = emptyModel();
    for (let i = 0; i < 5; i++) m = recordOpen(m, at('23')); // quiet
    for (let i = 0; i < 5; i++) m = recordOpen(m, at('07')); // quiet (before 8)
    for (let i = 0; i < 5; i++) m = recordOpen(m, at('14')); // ok
    const hrs = plannedNudgeHours(m);
    expect(hrs).toContain(14);
    expect(hrs.every((h) => !isQuietHour(h, DEFAULT_POLICY))).toBe(true);
    expect(hrs.length).toBeLessThanOrEqual(DEFAULT_POLICY.maxPerDay);
  });
});

describe('reconcileNudges — letting the fatigue model learn', () => {
  const at = (iso: string) => new Date(iso);

  it('counts a nudge the user did not tap', () => {
    // The whole point: local notifications fire without running JS, so this is
    // the only chance to notice one went out unanswered.
    const before = emptyModel();
    const after = reconcileNudges(before, [9], at('2026-08-28T08:00:00'), at('2026-08-28T12:00:00'));
    expect(after.ignoredStreak).toBe(1);
    expect(after.notifSent).toBe(1);
    expect(after.nudgeCountToday).toBe(1);
  });

  it('counts every scheduled hour that has passed', () => {
    const after = reconcileNudges(emptyModel(), [9, 19], at('2026-08-28T08:00:00'), at('2026-08-28T21:00:00'));
    expect(after.ignoredStreak).toBe(2);
  });

  it('ignores hours that have not come round yet', () => {
    const after = reconcileNudges(emptyModel(), [9, 19], at('2026-08-28T08:00:00'), at('2026-08-28T12:00:00'));
    expect(after.ignoredStreak).toBe(1);
  });

  it('counts across days away', () => {
    const after = reconcileNudges(emptyModel(), [9], at('2026-08-26T08:00:00'), at('2026-08-28T12:00:00'));
    expect(after.ignoredStreak).toBe(3); // 26th, 27th, 28th
  });

  it('caps a long absence so the feature can recover', () => {
    // Three weeks away really is sixty ignored nudges, but modelling it that
    // way would suppress nudges so hard they never come back.
    const after = reconcileNudges(emptyModel(), [9, 19], at('2026-08-01T08:00:00'), at('2026-08-28T12:00:00'));
    expect(after.ignoredStreak).toBe(DEFAULT_POLICY.maxPerDay * 3);
  });

  it('does nothing without a previous reconcile point', () => {
    // A first run must not invent history for a user who has seen nothing.
    expect(reconcileNudges(emptyModel(), [9], null, at('2026-08-28T12:00:00')).ignoredStreak).toBe(0);
  });

  it('does nothing when nothing is scheduled, or when no time has passed', () => {
    expect(reconcileNudges(emptyModel(), [], at('2026-08-28T08:00:00'), at('2026-08-28T12:00:00')).ignoredStreak).toBe(0);
    expect(reconcileNudges(emptyModel(), [9], at('2026-08-28T12:00:00'), at('2026-08-28T08:00:00')).ignoredStreak).toBe(0);
  });

  it('ignores nonsense hours rather than looping on them', () => {
    expect(reconcileNudges(emptyModel(), [99, -1, 1.5], at('2026-08-28T08:00:00'), at('2026-08-29T12:00:00')).ignoredStreak).toBe(0);
  });

  it('is what finally lets back-off engage', () => {
    // Before this existed, ignoredStreak could only ever be reset to 0, so
    // shouldSendNudge's back-off branch was unreachable in production.
    let m = emptyModel();
    m = reconcileNudges(m, [9, 19], at('2026-08-26T08:00:00'), at('2026-08-27T20:00:00'));
    expect(m.ignoredStreak).toBeGreaterThanOrEqual(DEFAULT_POLICY.backOffAfterIgnored);

    // With back-off engaged the daily allowance halves.
    const hours = plannedNudgeHours(m, DEFAULT_POLICY);
    expect(hours.length).toBeLessThanOrEqual(Math.max(1, Math.floor(DEFAULT_POLICY.maxPerDay / 2)));
  });

  it('an open still clears the streak, so a returning user is not punished', () => {
    let m = reconcileNudges(emptyModel(), [9, 19], at('2026-08-20T08:00:00'), at('2026-08-28T20:00:00'));
    expect(m.ignoredStreak).toBeGreaterThan(0);
    m = recordNudgeOpened(m);
    expect(m.ignoredStreak).toBe(0);
  });
});
