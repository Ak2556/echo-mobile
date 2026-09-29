import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_ATTEMPTS, MAX_PUSH_AGE_MS, backoffSeconds, isStale, onFailure } from './policy';

describe('worker retry policy', () => {
  it('retries with doubling backoff, capped at an hour', () => {
    expect([1, 2, 3, 4, 5].map(backoffSeconds)).toEqual([30, 60, 120, 240, 480]);
    expect(backoffSeconds(20)).toBe(3600);
  });

  it('dead-letters on the last attempt, never before', () => {
    expect(onFailure(MAX_ATTEMPTS - 1)).toBe('retry');
    expect(onFailure(MAX_ATTEMPTS)).toBe('dead');
  });

  it('expires pushes older than the age limit, and only those', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(isStale(new Date(now - MAX_PUSH_AGE_MS - 1000).toISOString(), now, MAX_PUSH_AGE_MS)).toBe(true);
    expect(isStale(new Date(now - 60_000).toISOString(), now, MAX_PUSH_AGE_MS)).toBe(false);
    expect(isStale('not a date', now, MAX_PUSH_AGE_MS)).toBe(false);
  });
});

/**
 * The producers are the part a refactor is most likely to regress: the old
 * versions called net.http_post directly and swallowed every error, which is
 * how pushes and moderation failed silently for weeks at a time.
 */
describe('producers enqueue durably', () => {
  const sql = readFileSync(resolve(__dirname, '../../migrations/20260928110000_job_layer.sql'), 'utf8');
  const body = (fn: string) => {
    const m = sql.match(new RegExp(`create or replace function public\\.${fn}\\(\\)[\\s\\S]*?\\$\\$;`));
    if (!m) throw new Error(`${fn} not found`);
    return m[0];
  };

  it.each(['fanout_push_on_notification', 'moderate_new_echo'])('%s enqueues and swallows nothing', (fn) => {
    expect(body(fn)).toMatch(/perform public\.jobs_enqueue\(/);
    expect(body(fn)).not.toMatch(/http_post/);
    expect(body(fn)).not.toMatch(/exception\s+when/i);
  });

  it('keeps the kick as the only best-effort step', () => {
    expect(body('jobs_sweep')).toMatch(/perform public\.jobs_kick\(/);
    const kick = sql.match(/create or replace function public\.jobs_kick\([\s\S]*?\$\$;/)?.[0] ?? '';
    expect(kick).toMatch(/exception when others/);
    const enqueue = sql.match(/create or replace function public\.jobs_enqueue\([\s\S]*?\$\$;/)?.[0] ?? '';
    expect(enqueue).not.toMatch(/exception\s+when/i);
  });

  it('opens the worker API to the service role only', () => {
    for (const fn of ['jobs_claim', 'jobs_ack', 'jobs_retry', 'jobs_dead', 'jobs_report']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    }
    expect(sql).not.toMatch(/grant execute on function public\.jobs_(enqueue|kick|sweep|health)/);
  });
});
