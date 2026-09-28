import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MAX_OPEN_SECONDS, isTransientStatus, openCircuitResponse, retryAfterSeconds } from './breakerPolicy';

describe('breaker policy', () => {
  it('counts rate limits and server errors, not client errors', () => {
    expect([429, 500, 502, 503].map(isTransientStatus)).toEqual([true, true, true, true]);
    expect([200, 400, 401, 402, 404].map(isTransientStatus)).toEqual([false, false, false, false, false]);
  });

  it('reads Retry-After in both forms, capped at the maximum', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(retryAfterSeconds('120', now)).toBe(120);
    expect(retryAfterSeconds('Sun, 28 Sep 2026 12:01:00 GMT', now)).toBe(60);
    expect(retryAfterSeconds('999999', now)).toBe(MAX_OPEN_SECONDS);
    expect(retryAfterSeconds(null, now)).toBeNull();
    expect(retryAfterSeconds('0', now)).toBeNull();
    expect(retryAfterSeconds('soon', now)).toBeNull();
  });

  it('answers for an open provider exactly like a provider 503', async () => {
    const now = Date.now();
    const res = openCircuitResponse('gemini', now + 30_000, now);
    expect(res.status).toBe(503);
    expect(res.ok).toBe(false);
    expect(res.headers.get('retry-after')).toBe('30');
    expect((await res.json()).error.code).toBe('circuit_open');
  });
});

/**
 * A provider call that bypasses the breaker keeps hammering a provider the
 * rest of the system already knows is down. Every model call goes through
 * guardedFetch; this finds one that does not.
 */
describe('every model provider call is guarded', () => {
  const root = resolve(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(root);

  it.each(files)('%s', (file) => {
    const src = readFileSync(file, 'utf8');
    const unguarded = src.match(/\bawait fetch\((?:GEMINI_URL|OPENROUTER_URL|EMBEDDING_URL|"https:\/\/(?:openrouter\.ai|generativelanguage\.googleapis\.com)[^"]*")/g) ?? [];
    expect(unguarded).toEqual([]);
  });
});
