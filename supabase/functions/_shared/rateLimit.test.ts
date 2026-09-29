import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The AI budget must be counted atomically. Reading the counter and then
 * upserting count + 1 let concurrent requests all pass on the same count, so a
 * scripted burst could spend the shared model quota (and with it moderation,
 * which fails closed) far past its limit. check_app_rate_limit locks the row.
 * rateLimit.ts imports esm.sh, which vitest cannot load, so this reads source.
 */
const src = readFileSync(resolve(__dirname, 'rateLimit.ts'), 'utf8');
const fn = src.slice(src.indexOf('export async function checkAndIncrementRateLimit'));

describe('AI rate limit', () => {
  it('counts through the locked counter, never read-then-write', () => {
    expect(fn).toMatch(/spendActionBudget\(userId, \[\{ action: "ai_chat_hour"/);
    expect(src).not.toMatch(/\.from\("ai_rate_limits"\)/);
  });

  it('fails closed when the counter is unavailable', () => {
    expect(fn).toMatch(/throw new Error\("Rate limit unavailable"\)/);
  });
});
