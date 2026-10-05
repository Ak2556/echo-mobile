import { describe, expect, it, vi } from 'vitest';
import { createUsernameChecker } from './usernameCheck';

function setup(answer: boolean | Error = false) {
  let t = 1_000;
  const fetchTaken = vi.fn(async (_u: string) => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const checker = createUsernameChecker({ fetchTaken, now: () => t });
  return { checker, fetchTaken, advance: (ms: number) => { t += ms; } };
}

describe('createUsernameChecker', () => {
  it('answers an unusable handle locally, without a request', async () => {
    const { checker, fetchTaken } = setup(false);
    expect(await checker.isTaken('ab')).toBe(true);
    expect(await checker.isTaken('has space')).toBe(true);
    expect(await checker.isTaken('a'.repeat(21))).toBe(true);
    expect(fetchTaken).not.toHaveBeenCalled();
  });

  it('normalises case and whitespace before asking', async () => {
    const { checker, fetchTaken } = setup(false);
    await checker.isTaken('  Akash_99 ');
    expect(fetchTaken).toHaveBeenCalledWith('akash_99');
  });

  it('shares one request between simultaneous asks', async () => {
    const { checker, fetchTaken } = setup(true);
    const [a, b, c] = await Promise.all([checker.isTaken('akash'), checker.isTaken('AKASH'), checker.isTaken('akash')]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(fetchTaken).toHaveBeenCalledTimes(1);
  });

  it('remembers "taken" for minutes and "available" only briefly', async () => {
    const taken = setup(true);
    await taken.checker.isTaken('akash');
    taken.advance(4 * 60_000);
    await taken.checker.isTaken('akash');
    expect(taken.fetchTaken).toHaveBeenCalledTimes(1);
    taken.advance(2 * 60_000);
    await taken.checker.isTaken('akash');
    expect(taken.fetchTaken).toHaveBeenCalledTimes(2);

    const free = setup(false);
    await free.checker.isTaken('akash');
    free.advance(10_000);
    await free.checker.isTaken('akash');
    expect(free.fetchTaken).toHaveBeenCalledTimes(1);
    free.advance(25_000);
    await free.checker.isTaken('akash');
    expect(free.fetchTaken).toHaveBeenCalledTimes(2);
  });

  it('never remembers a failure, so the next ask retries', async () => {
    const { checker, fetchTaken } = setup(new Error('offline'));
    await expect(checker.isTaken('akash')).rejects.toThrow('offline');
    await expect(checker.isTaken('akash')).rejects.toThrow('offline');
    expect(fetchTaken).toHaveBeenCalledTimes(2);
  });

  it('clear() forgets everything', async () => {
    const { checker, fetchTaken } = setup(true);
    await checker.isTaken('akash');
    checker.clear();
    await checker.isTaken('akash');
    expect(fetchTaken).toHaveBeenCalledTimes(2);
  });
});
