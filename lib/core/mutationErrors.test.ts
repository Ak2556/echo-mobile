import { describe, expect, it } from 'vitest';
import { E2EEError } from '../e2ee/crypto';
import { friendlyWriteError, isNotSignedInError, RECIPIENT_NOT_READY_MESSAGE } from './mutationErrors';

describe('friendlyWriteError', () => {
  it('tells the sender why a 1:1 message cannot go yet, instead of "try again"', () => {
    expect(friendlyWriteError(new E2EEError('recipient_not_ready'))).toBe(RECIPIENT_NOT_READY_MESSAGE);
  });

  it('leaves other E2EE failures on the generic path', () => {
    expect(friendlyWriteError(new E2EEError('decrypt_failed'))).not.toBe(RECIPIENT_NOT_READY_MESSAGE);
  });
});

describe('no session', () => {
  it('is not reported as a connection or generic failure', () => {
    const e = new Error('Not signed in');
    expect(isNotSignedInError(e)).toBe(true);
    expect(friendlyWriteError(e)).toMatch(/session ended/i);
    expect(friendlyWriteError(e)).not.toMatch(/Couldn.t save/);
  });

  it('leaves other errors alone', () => {
    expect(isNotSignedInError(new Error('boom'))).toBe(false);
    expect(isNotSignedInError(null)).toBe(false);
  });
});
