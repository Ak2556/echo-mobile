import { describe, expect, it } from 'vitest';
import { chunk, classifyTickets, deviceTokens } from './expoTickets';

const A = 'ExponentPushToken[aaa]';
const B = 'ExpoPushToken[bbb]';
const C = 'ExponentPushToken[ccc]';

describe('deviceTokens', () => {
  it('reaches every device, not just the last one signed in', () => {
    expect(deviceTokens([{ token: A }, { token: B }], null)).toEqual([A, B]);
  });

  it('keeps an install that only ever wrote the legacy column', () => {
    expect(deviceTokens([{ token: A }], C)).toEqual([A, C]);
  });

  it('sends once to a token held in both stores', () => {
    expect(deviceTokens([{ token: A }], A)).toEqual([A]);
  });

  it('drops values that are not Expo tokens', () => {
    expect(deviceTokens([{ token: 'garbage' }, { token: null }], '')).toEqual([]);
  });
});

describe('deviceTokens: iOS before APNs credentials exist', () => {
  const ios = { token: A, platform: 'ios' };
  const android = { token: B, platform: 'android' };

  it('drops iOS devices and keeps Android ones', () => {
    expect(deviceTokens([ios, android], null, { skipIos: true })).toEqual([B]);
  });

  it('keeps everything when iOS push is enabled, which is also the default of the pure helper', () => {
    expect(deviceTokens([ios, android], null, { skipIos: false })).toEqual([A, B]);
    expect(deviceTokens([ios, android], null)).toEqual([A, B]);
  });

  it('drops a legacy token that is the same device as a skipped iOS one', () => {
    expect(deviceTokens([ios], A, { skipIos: true })).toEqual([]);
  });

  it('keeps a legacy token it cannot place on iOS', () => {
    expect(deviceTokens([android], C, { skipIos: true })).toEqual([B, C]);
  });

  it('does not treat a missing platform as iOS, so an unlabelled Android token is not lost', () => {
    expect(deviceTokens([{ token: B }], null, { skipIos: true })).toEqual([B]);
  });
});

describe('classifyTickets', () => {
  it('reads each ticket against the token it was sent to, by position', () => {
    const out = classifyTickets([A, B, C], [
      { status: 'ok', id: 't1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'bad creds', details: { error: 'InvalidCredentials' } },
    ]);
    expect(out.accepted).toEqual([{ token: A, ticketId: 't1' }]);
    expect(out.dead).toEqual([B]);
    expect(out.fatal).toEqual([{ token: C, error: 'InvalidCredentials: bad creds' }]);
  });

  it('treats an error inside an HTTP 200 as a failure, never as delivered', () => {
    const out = classifyTickets([A], [{ status: 'error', details: { error: 'InvalidCredentials' } }]);
    expect(out.accepted).toEqual([]);
    expect(out.fatal).toHaveLength(1);
  });

  it('reports a missing ticket instead of assuming success', () => {
    expect(classifyTickets([A, B], [{ status: 'ok', id: 't1' }]).fatal).toEqual([{ token: B, error: 'no ticket' }]);
  });
});

describe('chunk', () => {
  it('splits at Expo’s per-request limit', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
