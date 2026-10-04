import { describe, expect, it } from 'vitest';
import { createLimiter } from './limiter';

describe('createLimiter', () => {
  it('never runs more than max at once, and runs every job', async () => {
    const run = createLimiter(2);
    let live = 0;
    let peak = 0;
    const job = async () => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return 1;
    };
    const results = await Promise.all(Array.from({ length: 7 }, () => run(job)));
    expect(results).toHaveLength(7);
    expect(peak).toBe(2);
  });

  it('a failing job does not stall the ones behind it', async () => {
    const run = createLimiter(1);
    const bad = run(async () => { throw new Error('x'); });
    const good = run(async () => 'ok');
    await expect(bad).rejects.toThrow('x');
    await expect(good).resolves.toBe('ok');
  });
});
