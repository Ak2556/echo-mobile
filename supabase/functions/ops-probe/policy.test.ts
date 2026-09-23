import { describe, expect, it } from 'vitest';
import {
  ALERT_BODY_LIMIT,
  REALERT_AFTER_MINUTES,
  STUCK_AFTER_MINUTES,
  STUCK_WINDOW_HOURS,
  alertBody,
  interpretModeration,
  interpretStuck,
  overallStatus,
  shouldAlert,
  stuckWindow,
  type CheckResult,
  type ProbeRunRow,
} from './policy';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 3600_000;
const run = (mins: number, ok: boolean, alerted = false): ProbeRunRow => ({
  ok, alerted, ran_at: new Date(NOW - mins * MIN).toISOString(),
});

describe('stuckWindow', () => {
  it('spans from 24 hours ago to 20 minutes ago', () => {
    const w = stuckWindow(NOW);
    expect(w.since).toBe(new Date(NOW - STUCK_WINDOW_HOURS * HOUR).toISOString());
    expect(w.before).toBe(new Date(NOW - STUCK_AFTER_MINUTES * MIN).toISOString());
    expect(Date.parse(w.since)).toBeLessThan(Date.parse(w.before));
  });

  it('excludes a post younger than the grace period, and includes one older', () => {
    const w = stuckWindow(NOW);
    const young = new Date(NOW - (STUCK_AFTER_MINUTES - 1) * MIN).toISOString();
    const late = new Date(NOW - (STUCK_AFTER_MINUTES + 1) * MIN).toISOString();
    expect(young < w.before).toBe(false);
    expect(late < w.before).toBe(true);
  });

  it('drops a post the sweep has already given up on', () => {
    const w = stuckWindow(NOW);
    const ancient = new Date(NOW - (STUCK_WINDOW_HOURS + 1) * HOUR).toISOString();
    expect(ancient > w.since).toBe(false);
  });
});

describe('interpretModeration', () => {
  it('passes on a safe verdict and reports the latency', () => {
    const r = interpretModeration({ ok: true, categories: [] }, 1455);
    expect(r).toEqual({ check: 'moderation', ok: true, detail: 'verdict in 1455 ms' });
  });

  it('fails when the classifier is unreachable, and says why', () => {
    const r = interpretModeration(
      { ok: false, categories: ['moderation_unavailable'], error: 'Gemini 429: quota' }, 8000,
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('unavailable after 8000 ms');
    expect(r.detail).toContain('quota');
  });

  it('still fails when the outage carries no detail', () => {
    const r = interpretModeration({ ok: false, categories: ['moderation_unavailable'] }, 10);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('no detail');
  });

  it('fails when benign text is flagged, because the gate is then miscalibrated', () => {
    const r = interpretModeration({ ok: false, categories: ['violence', 'hate'] }, 900);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('benign text flagged as violence, hate');
  });
});

describe('interpretStuck', () => {
  it('passes only on zero', () => {
    expect(interpretStuck(0).ok).toBe(true);
    expect(interpretStuck(1).ok).toBe(false);
    expect(interpretStuck(97).ok).toBe(false);
  });

  it('names the count and the threshold in the detail', () => {
    expect(interpretStuck(3).detail).toBe('3 post(s) hidden with no verdict for over 20 min');
    expect(interpretStuck(0).detail).toBe('no post waiting on a verdict');
  });

  it('treats a failed count as a failure: unknown is not healthy', () => {
    const r = interpretStuck(null, 'permission denied for table public_echoes');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('query failed');
  });

  it('does not invent a failure from a missing count', () => {
    expect(interpretStuck(null).ok).toBe(true);
    expect(interpretStuck(undefined as unknown as null).ok).toBe(true);
    expect(interpretStuck(-1).ok).toBe(true);
  });
});

describe('shouldAlert', () => {
  it('alerts the first time a check is ever seen failing', () => {
    expect(shouldAlert([], NOW)).toBe(true);
  });

  it('alerts on the transition from healthy to failing', () => {
    expect(shouldAlert([run(30, true)], NOW)).toBe(true);
  });

  it('alerts when the previous run failed but nobody was told', () => {
    expect(shouldAlert([run(30, false, false), run(60, false, false)], NOW)).toBe(true);
  });

  it('stays quiet while the failure is already known', () => {
    expect(shouldAlert([run(30, false, true)], NOW)).toBe(false);
    expect(shouldAlert([run(30, false, false), run(60, false, true)], NOW)).toBe(false);
  });

  it('speaks up again only after the re-alert window', () => {
    const justInside = run(REALERT_AFTER_MINUTES - 1, false, true);
    const justOutside = run(REALERT_AFTER_MINUTES + 1, false, true);
    expect(shouldAlert([justInside], NOW)).toBe(false);
    expect(shouldAlert([justOutside], NOW)).toBe(true);
    // Exactly on the boundary counts as still inside: one alert, not two.
    expect(shouldAlert([run(REALERT_AFTER_MINUTES, false, true)], NOW)).toBe(false);
  });

  it('uses the most recent alert, not the oldest one', () => {
    const rows = [run(10, false, false), run(20, false, true), run(600, false, true)];
    expect(shouldAlert(rows, NOW)).toBe(false);
  });

  it('alerts again after a recovery and a fresh failure', () => {
    // Fixed, then broke again: the healthy run in between resets the silence.
    expect(shouldAlert([run(5, true), run(400, false, true)], NOW)).toBe(true);
  });

  it('survives a history with no rows for this check', () => {
    expect(shouldAlert(undefined as unknown as ProbeRunRow[], NOW)).toBe(true);
  });
});

describe('alertBody', () => {
  const fail = (check: string, detail: string): CheckResult => ({ check, ok: false, detail });

  it('names the check and the reason', () => {
    expect(alertBody([fail('stuck_posts', '2 post(s) hidden')])).toBe('stuck_posts: 2 post(s) hidden');
  });

  it('joins several failures in the order they were checked', () => {
    const body = alertBody([fail('stuck_posts', 'a'), fail('moderation', 'b')]);
    expect(body).toBe('stuck_posts: a · moderation: b');
  });

  it('fits on a lock screen', () => {
    const body = alertBody([fail('moderation', 'x'.repeat(400))]);
    expect(body.length).toBe(ALERT_BODY_LIMIT);
  });
});

describe('overallStatus', () => {
  const ok = (check: string): CheckResult => ({ check, ok: true, detail: 'fine' });
  const bad = (check: string): CheckResult => ({ check, ok: false, detail: 'broken' });

  it('reports the verdict in the body', () => {
    expect(overallStatus([ok('a'), ok('b')])).toMatchObject({ ok: true });
    expect(overallStatus([ok('a'), bad('b')])).toMatchObject({ ok: false });
    expect(overallStatus([bad('a'), bad('b')]).failures).toHaveLength(2);
  });

  it('answers 200 even when a check failed, so the alarm does not alarm about itself', () => {
    // pg_net logs every non-2xx, and cron_health counts those for two hours, so
    // a 503 here kept cron_health red long after the incident was over.
    expect(overallStatus([bad('a')]).status).toBe(200);
    expect(overallStatus([ok('a')]).status).toBe(200);
  });

  it('treats an empty run as healthy rather than inventing an outage', () => {
    expect(overallStatus([])).toMatchObject({ ok: true, status: 200 });
  });
});

describe('the alert storm this is meant to prevent', () => {
  it('pushes on the way in, then at most once per re-alert window', () => {
    // Broken for six hours, probed every 30 minutes.
    const history: ProbeRunRow[] = [];
    const alertedAtHours: number[] = [];
    for (let i = 0; i < 12; i++) {
      const now = NOW + i * 30 * MIN;
      const alerting = shouldAlert(history.slice().reverse(), now);
      if (alerting) alertedAtHours.push(i / 2);
      history.push({ ok: false, alerted: alerting, ran_at: new Date(now).toISOString() });
    }
    // Once immediately, then the first run strictly past three hours. The next
    // would be at 6.5 h, outside this window. Twelve failing runs, two pushes.
    expect(alertedAtHours).toEqual([0, 3.5]);
  });

  it('a recovery in the middle lets the next failure through immediately', () => {
    const history: ProbeRunRow[] = [
      { ok: true, alerted: false, ran_at: new Date(NOW - 30 * MIN).toISOString() },
      { ok: false, alerted: true, ran_at: new Date(NOW - 60 * MIN).toISOString() },
    ];
    expect(shouldAlert(history, NOW)).toBe(true);
  });
});
