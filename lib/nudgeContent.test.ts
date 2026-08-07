import { describe, it, expect } from 'vitest';
import { buildPlannedNudges } from './nudgeContent';
import { emptyModel, recordOpen } from './engagementModel';

const at = (h: string) => new Date(`2026-07-18T${h}:00:00`);

describe('buildPlannedNudges', () => {
  it('leads with the streak-at-risk signal (routes to habits)', () => {
    const out = buildPlannedNudges(emptyModel(), { streakAtRisk: { name: 'Reading', streak: 6 } }, [14, 20]);
    expect(out[0].surface).toBe('tools');
    expect(out[0].route).toBe('/mini-apps/habits');
    expect(out[0].body).toContain('Reading');
    expect(out[0].body).toContain('6');
    expect(out[0].hour).toBe(14);
  });

  it('surfaces habits still open today, with the count + a route', () => {
    const out = buildPlannedNudges(emptyModel(), { habitsRemaining: 3 }, [10]);
    expect(out[0].surface).toBe('tools');
    expect(out[0].route).toBe('/mini-apps/habits');
    expect(out[0].body).toContain('3');
  });

  it('nudges toward the focus goal when partway (count + goal baked in)', () => {
    const out = buildPlannedNudges(emptyModel(), { focusGoal: { done: 3, goal: 8 } }, [15]);
    expect(out[0].surface).toBe('tools');
    expect(out[0].route).toBe('/mini-apps/pomodoro');
    expect(out[0].body).toContain('3');
    expect(out[0].body).toContain('8');
  });

  it('does not fire a focus nudge when untouched or already met', () => {
    expect(buildPlannedNudges(emptyModel(), { focusGoal: { done: 0, goal: 8 } }, [15])[0].surface).toBe('chat');
    expect(buildPlannedNudges(emptyModel(), { focusGoal: { done: 8, goal: 8 } }, [15])[0].surface).toBe('chat');
  });

  it('celebrates a strong best-streak (>=5) when nothing is at risk', () => {
    const out = buildPlannedNudges(emptyModel(), { bestStreak: { name: 'Meditation', streak: 12 } }, [11]);
    expect(out[0].surface).toBe('tools');
    expect(out[0].body).toContain('Meditation');
    expect(out[0].body).toContain('12');
  });

  it('streak-at-risk outranks the softer reasoned signals', () => {
    const out = buildPlannedNudges(
      emptyModel(),
      { streakAtRisk: { name: 'Reading', streak: 6 }, habitsRemaining: 3, focusGoal: { done: 2, goal: 8 } },
      [9, 14, 19],
    );
    expect(out[0].body).toContain('Reading');
    expect(out[1].body).toContain('8'); // focus-goal fills the next slot
  });

  it('prefers unanswered daily question when no streak at risk', () => {
    const out = buildPlannedNudges(emptyModel(), { dailyUnanswered: true }, [10]);
    expect(out[0].surface).toBe('daily');
  });

  it('surfaces unread DMs with the count baked in', () => {
    const one = buildPlannedNudges(emptyModel(), { unreadDMs: 1 }, [10]);
    expect(one[0].surface).toBe('dm');
    expect(one[0].body.toLowerCase()).toContain('message');
    const many = buildPlannedNudges(emptyModel(), { unreadDMs: 4 }, [10]);
    expect(many[0].surface).toBe('dm');
    expect(many[0].body).toContain('4');
  });

  it('falls back to the top interest surface with no signals', () => {
    let m = emptyModel();
    for (let i = 0; i < 3; i++) m = recordOpen(m, at('10'), 'marketplace');
    const out = buildPlannedNudges(m, {}, [10, 15]);
    expect(out[0].surface).toBe('marketplace');
    expect(out[1].surface).toBe('marketplace');
  });

  it('uses the chat fallback when there is no interest signal at all', () => {
    const out = buildPlannedNudges(emptyModel(), {}, [12]);
    expect(out[0].surface).toBe('chat');
  });

  it('nudges toward the mini-apps the user actually uses, with a route', () => {
    const out = buildPlannedNudges(emptyModel(), { favoriteMiniApps: ['habits', 'fitness'] }, [10, 15]);
    expect(out[0].surface).toBe('tools');
    expect(out[0].route).toBe('/mini-apps/habits');
    expect(out[0].title.length).toBeGreaterThan(0);
    expect(out[0].body.length).toBeGreaterThan(0);
    // Rotates across favorites for later slots.
    expect(out[1].route).toBe('/mini-apps/fitness');
  });

  it('lets a live signal outrank mini-app nudges in the first slot', () => {
    const out = buildPlannedNudges(
      emptyModel(),
      { dailyUnanswered: true, favoriteMiniApps: ['tasks'] },
      [9, 18],
    );
    expect(out[0].surface).toBe('daily');
    expect(out[1].route).toBe('/mini-apps/tasks');
  });
});
