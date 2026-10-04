import { beforeEach, describe, expect, it } from 'vitest';
import { answerHealthConsent, ensureHealthConsent, hasHealthConsent, useHealthConsent } from './healthConsent';

beforeEach(() => {
  useHealthConsent.setState({ answer: 'undecided', pending: null });
});

describe('health data consent', () => {
  it('asks once, and a yes is remembered', async () => {
    const p = ensureHealthConsent();
    answerHealthConsent(true);
    await expect(p).resolves.toBe(true);
    expect(hasHealthConsent()).toBe(true);
    await expect(ensureHealthConsent()).resolves.toBe(true);
    expect(useHealthConsent.getState().pending).toBeNull();
  });

  it('a no is remembered too, so saving never nags', async () => {
    const p = ensureHealthConsent();
    answerHealthConsent(false);
    await expect(p).resolves.toBe(false);
    await expect(ensureHealthConsent()).resolves.toBe(false);
    expect(useHealthConsent.getState().pending).toBeNull();
    expect(hasHealthConsent()).toBe(false);
  });
});
