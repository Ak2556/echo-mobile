import { describe, expect, it } from 'vitest';
import { clientIdOfFailedDM, failedDMId, failedDMMatching, newDMClientId, pendingDMId } from './dmLocalIds';

describe('local DM ids carry the message id through a failure', () => {
  it('pending → failed → retry keeps the same message id', () => {
    const clientId = newDMClientId();
    const failed = failedDMId(pendingDMId(clientId));
    expect(failed).toBe(`failed-${clientId}`);
    expect(clientIdOfFailedDM(failed)).toBe(clientId);
  });

  it('two sends get different ids', () => {
    expect(newDMClientId()).not.toBe(newDMClientId());
  });

  it('only a failed bubble yields a retry id', () => {
    expect(clientIdOfFailedDM('pending-abc')).toBeNull();
    expect(clientIdOfFailedDM('3f2c0000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('failedDMMatching: pressing send again is a retry', () => {
  const thread = [
    { id: 'real-1', content: 'on my way', replyToId: null },
    { id: 'failed-a', content: 'on my way', replyToId: null },
    { id: 'failed-b', content: 'see you', replyToId: 'real-1' },
    { id: 'pending-c', content: 'lol', replyToId: null },
  ];

  it('matches a failed bubble with the same text', () => {
    expect(failedDMMatching(thread, 'on my way')).toBe('failed-a');
  });

  it('ignores delivered and still-sending messages', () => {
    expect(failedDMMatching(thread, 'lol')).toBeNull();
    expect(failedDMMatching([thread[0]], 'on my way')).toBeNull();
  });

  it('requires the same reply target', () => {
    expect(failedDMMatching(thread, 'see you')).toBeNull();
    expect(failedDMMatching(thread, 'see you', 'real-1')).toBe('failed-b');
    expect(failedDMMatching(thread, 'on my way', 'real-1')).toBeNull();
  });

  it('new text is a new message', () => {
    expect(failedDMMatching(thread, 'on my way!')).toBeNull();
  });
});
