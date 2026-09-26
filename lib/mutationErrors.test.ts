import { describe, expect, it } from 'vitest';
import { E2EEError } from './e2ee/crypto';
import { friendlyWriteError, RECIPIENT_NOT_READY_MESSAGE } from './mutationErrors';

describe('friendlyWriteError', () => {
  it('tells the sender why a 1:1 message cannot go yet, instead of "try again"', () => {
    expect(friendlyWriteError(new E2EEError('recipient_not_ready'))).toBe(RECIPIENT_NOT_READY_MESSAGE);
  });

  it('leaves other E2EE failures on the generic path', () => {
    expect(friendlyWriteError(new E2EEError('decrypt_failed'))).not.toBe(RECIPIENT_NOT_READY_MESSAGE);
  });
});
