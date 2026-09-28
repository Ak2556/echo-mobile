import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { truncate } from '../supabase/functions/daily-question-push/copy';

/**
 * Scheduled pushes must be safe to run twice. Both used to decide who to push
 * and record that they had in separate steps, so a repeated or overlapping run
 * pushed the same people again.
 */
const root = resolve(__dirname, '..');
const sql = readFileSync(resolve(root, 'supabase/migrations/20260928140000_scheduled_pushes_exactly_once.sql'), 'utf8');
const fanout = readFileSync(resolve(root, 'supabase/functions/personalized-fanout/index.ts'), 'utf8');
const daily = readFileSync(resolve(root, 'supabase/functions/daily-question-push/index.ts'), 'utf8');

describe('scheduled pushes run exactly once', () => {
  it('claims the daily broadcast before enqueueing anything', () => {
    const fn = sql.slice(sql.indexOf('function public.claim_daily_broadcast'));
    expect(fn.indexOf('on conflict (question_id) do nothing')).toBeLessThan(fn.indexOf("jobs_enqueue('broadcast'"));
    expect(daily).toMatch(/rpc\('claim_daily_broadcast'\)/);
    expect(daily).not.toMatch(/exp\.host/);
  });

  it('claims nudges in one statement that skips rows another run holds', () => {
    expect(sql).toMatch(/for update of np skip locked/);
    expect(sql).toMatch(/set last_nudged_at = now\(\)/);
    expect(fanout).toMatch(/rpc\('claim_due_nudges'/);
    // The old path stamped each user after inserting their nudge.
    expect(fanout).not.toMatch(/update\(\{ last_nudged_at/);
  });

  it('keeps the project URL out of cron commands', () => {
    expect(sql).not.toMatch(/eyokhisijabitzjiydmz|supabase\.co/);
  });
});

describe('daily copy', () => {
  it('truncates long questions with an ellipsis', () => {
    expect(truncate('a'.repeat(200), 150)).toHaveLength(150);
    expect(truncate('short', 150)).toBe('short');
  });
});
