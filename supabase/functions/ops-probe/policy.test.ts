import { describe, expect, it } from 'vitest';
import {
  ALERT_BODY_LIMIT,
  REALERT_AFTER_MINUTES,
  STUCK_AFTER_MINUTES,
  STUCK_WINDOW_HOURS,
  alertBody,
  alertDelivered,
  alertEmail,
  alertRecipients,
  chatProbeDue,
  EMBEDDING_AGREEMENT_MIN,
  interpretChat,
  interpretEmbeddings,
  interpretModeration,
  interpretQueues,
  interpretStuck,
  overallStatus,
  QUEUE_STALE_MINUTES,
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

describe('alertEmail', () => {
  const fail = (check: string, detail: string): CheckResult => ({ check, ok: false, detail });

  it('names every failed check in the subject', () => {
    const mail = alertEmail([fail('job_queues', 'a'), fail('moderation', 'b')], '2026-10-03T08:00:00.000Z');
    expect(mail.subject).toBe('Echo probe failed: job_queues, moderation');
  });

  it('carries the full detail the lock screen had to cut', () => {
    const long = 'x'.repeat(400);
    const mail = alertEmail([fail('moderation', long)], '2026-10-03T08:00:00.000Z');
    expect(mail.text).toContain('moderation: ' + long);
    expect(mail.text).toContain('2026-10-03T08:00:00.000Z');
  });
});

describe('alertRecipients', () => {
  it('reads a comma-separated list and drops anything that is not an address', () => {
    expect(alertRecipients(' a@x.com, ,b@y.org,nope ')).toEqual(['a@x.com', 'b@y.org']);
  });

  it('is empty when unset', () => {
    expect(alertRecipients(undefined)).toEqual([]);
    expect(alertRecipients('')).toEqual([]);
  });
});

describe('alertDelivered', () => {
  // Recording an alert nobody received starts the three-hour quiet window, so a
  // failure whose push and email both bounced would stay silent until then.
  it('counts as alerted only when some channel reached someone', () => {
    expect(alertDelivered(0, false)).toBe(false);
    expect(alertDelivered(2, false)).toBe(true);
    expect(alertDelivered(0, true)).toBe(true);
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

describe('interpretQueues', () => {
  // 2026-10-02: the job layer ran for three days with no worker secret. Every
  // queue grew (62 pushes, 4 posts awaiting moderation) while the sweeper cron
  // reported success each minute. The oldest waiting job is what shows it.
  const q = (name: string, depth: number, ageMin: number | null) => ({
    queue_name: name,
    depth,
    oldest_enqueued_at: ageMin === null ? null : new Date(NOW - ageMin * MIN).toISOString(),
  });

  it('passes when every queue is empty or fresh', () => {
    const r = interpretQueues([q('push', 0, null), q('moderation', 2, 1)], null, NOW);
    expect(r).toMatchObject({ check: 'job_queues', ok: true });
  });

  it('fails when any queue has a job waiting longer than the limit', () => {
    const r = interpretQueues([q('push', 62, 3 * 24 * 60), q('moderation', 4, 25), q('media_gc', 1, 2)], null, NOW);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('push 62 waiting, oldest 3d');
    expect(r.detail).toContain('moderation 4 waiting, oldest 25m');
    expect(r.detail).not.toContain('media_gc');
  });

  it('treats exactly the limit as still fresh', () => {
    expect(interpretQueues([q('push', 1, QUEUE_STALE_MINUTES)], null, NOW).ok).toBe(true);
    expect(interpretQueues([q('push', 1, QUEUE_STALE_MINUTES + 1)], null, NOW).ok).toBe(false);
  });

  it('counts the dead-letter queue like any other: a parked job is lost work', () => {
    expect(interpretQueues([q('dlq', 1, 60)], null, NOW).ok).toBe(false);
  });

  it('fails when the health query fails, because unknown is not healthy', () => {
    const r = interpretQueues(null, 'permission denied for function job_queue_health', NOW);
    expect(r).toMatchObject({ ok: false });
    expect(r.detail).toContain('query failed');
  });

  it('fails when no queues come back at all', () => {
    expect(interpretQueues([], null, NOW).ok).toBe(false);
  });
});

describe('interpretChat', () => {
  it('passes quietly when the requested model answers', () => {
    expect(interpretChat('google/gemini-2.5-flash', { answeredBy: 'gemini-2.5-flash' }, 900))
      .toEqual({ check: 'chat', ok: true, detail: 'gemini-2.5-flash answered in 900 ms' });
  });

  it('passes but names the stand-in when the requested model is retired', () => {
    const r = interpretChat('google/gemini-2.5-flash', { answeredBy: 'gemini-3.8-flash' }, 1200);
    expect(r.ok).toBe(true);
    expect(r.detail).toBe('gemini-2.5-flash is retired; stand-in gemini-3.8-flash answered in 1200 ms');
  });

  it('says when only OpenRouter answered', () => {
    expect(interpretChat('google/gemini-2.5-flash', {}, 3000).detail).toMatch(/^answered by OpenRouter/);
  });

  it('fails when nothing answered, which is what users saw on 2026-11-19', () => {
    const r = interpretChat('google/gemini-2.5-flash', { error: 'Gemini 404 (gemini-2.5-flash): gone; OpenRouter 402: no credits' }, 2100);
    expect(r).toMatchObject({ check: 'chat', ok: false });
    expect(r.detail).toMatch(/^no answer after 2100 ms: Gemini 404/);
  });
});

describe('chatProbeDue', () => {
  it('runs in the first half-hour of every third UTC hour, about eight times a day', () => {
    const due = Array.from({ length: 48 }, (_, i) => chatProbeDue(new Date(Date.UTC(2026, 10, 19, Math.floor(i / 2), (i % 2) * 30))));
    expect(due.filter(Boolean)).toHaveLength(8);
    expect(chatProbeDue(new Date(Date.UTC(2026, 10, 19, 6, 0)))).toBe(true);
    expect(chatProbeDue(new Date(Date.UTC(2026, 10, 19, 6, 30)))).toBe(false);
    expect(chatProbeDue(new Date(Date.UTC(2026, 10, 19, 7, 0)))).toBe(false);
  });

  it('runs every time while the last check was degraded, so a fix shows within 30 minutes', () => {
    const off = new Date(Date.UTC(2026, 10, 19, 7, 30));
    expect(chatProbeDue(off, { ok: true, detail: 'answered by OpenRouter in 2537 ms (Gemini did not answer)' })).toBe(true);
    expect(chatProbeDue(off, { ok: false, detail: 'no answer after 900 ms: x' })).toBe(true);
    expect(chatProbeDue(off, { ok: true, detail: 'gemini-2.5-flash is retired; stand-in gemini-2.5-flash-lite answered in 800 ms' })).toBe(false);
    expect(chatProbeDue(off, null)).toBe(false);
  });

  it('records why Gemini did not answer when OpenRouter did', () => {
    const r = interpretChat('google/gemini-2.5-flash', { fallbackReason: 'Gemini 429 (gemini-3.8-flash): quota' }, 2537);
    expect(r.detail).toBe('answered by OpenRouter in 2537 ms (Gemini did not answer: Gemini 429 (gemini-3.8-flash): quota)');
  });
});

describe('interpretEmbeddings', () => {
  const v = [1, 2, 3];
  const sim = (c: number) => () => c;

  it('passes when the two providers agree', () => {
    expect(interpretEmbeddings({ vector: v }, { vector: v }, sim(0.99997), 300))
      .toEqual({ check: 'embeddings', ok: true, detail: 'Gemini and OpenRouter agree (cosine 0.99997) in 300 ms' });
  });

  it('fails when they disagree, because new vectors would not match stored ones', () => {
    const r = interpretEmbeddings({ vector: v }, { vector: v }, sim(EMBEDDING_AGREEMENT_MIN - 0.01), 300);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/disagree \(cosine 0\.98000\)/);
  });

  it('treats a NaN similarity (mismatched sizes) as disagreement', () => {
    expect(interpretEmbeddings({ vector: v }, { vector: [1] }, () => NaN, 1).ok).toBe(false);
  });

  it('passes on Gemini alone and says it could not compare', () => {
    expect(interpretEmbeddings({ vector: v }, { error: 'OpenRouter embedding 402' }, sim(1), 200).detail)
      .toBe('Gemini answered in 200 ms; OpenRouter unavailable to compare');
  });

  it('passes on the OpenRouter fallback but names the Gemini failure', () => {
    const r = interpretEmbeddings({ error: 'Gemini embedding 429' }, { vector: v }, sim(1), 200);
    expect(r).toMatchObject({ ok: true });
    expect(r.detail).toMatch(/Gemini failed, OpenRouter answered \(Gemini embedding 429\)/);
  });

  it('fails when nothing answers', () => {
    expect(interpretEmbeddings({ error: 'a' }, { error: 'b' }, sim(1), 900)).toMatchObject({ ok: false, detail: 'no provider answered after 900 ms: a; b' });
  });
});
