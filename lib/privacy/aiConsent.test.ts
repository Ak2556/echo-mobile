import { beforeEach, describe, expect, it } from 'vitest';
import { answerAiConsent, ensureAiConsent, requireAiConsent, useAiConsent } from './aiConsent';

beforeEach(() => {
  useAiConsent.setState({ answer: 'undecided', pending: null });
});

describe('ensureAiConsent', () => {
  it('asks when undecided and resolves with the answer', async () => {
    const p = ensureAiConsent();
    expect(useAiConsent.getState().pending).not.toBeNull();
    answerAiConsent(true);
    await expect(p).resolves.toBe(true);
    expect(useAiConsent.getState().answer).toBe('granted');
    expect(useAiConsent.getState().pending).toBeNull();
  });

  it('does not ask again once granted', async () => {
    useAiConsent.setState({ answer: 'granted' });
    await expect(ensureAiConsent()).resolves.toBe(true);
    expect(useAiConsent.getState().pending).toBeNull();
  });

  it('a refusal is not remembered as consent, and asks again next time', async () => {
    const p = ensureAiConsent();
    answerAiConsent(false);
    await expect(p).resolves.toBe(false);
    expect(useAiConsent.getState().answer).not.toBe('granted');
    void ensureAiConsent();
    expect(useAiConsent.getState().pending).not.toBeNull();
  });

  it('answers every caller waiting on the same sheet', async () => {
    const a = ensureAiConsent();
    const b = ensureAiConsent();
    answerAiConsent(true);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
  });

  it('requireAiConsent throws a readable message on refusal', async () => {
    const p = requireAiConsent();
    answerAiConsent(false);
    await expect(p).rejects.toThrow(/Settings → Privacy/);
  });
});
