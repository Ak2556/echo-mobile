import { describe, expect, it } from 'vitest';
import { PUSH_OFFER_GAP_MS, PUSH_OFFER_MAX, recordPushOffer, shouldOfferPush } from './pushPromptPolicy';

const never = { count: 0, lastAt: 0 };
const T0 = 1_760_000_000_000;

describe('shouldOfferPush', () => {
  it('offers the first time permission is undetermined', () => {
    expect(shouldOfferPush('undetermined', never, T0)).toBe(true);
  });

  it('never offers once the OS has an answer', () => {
    expect(shouldOfferPush('granted', never, T0)).toBe(false);
    expect(shouldOfferPush('denied', never, T0)).toBe(false);
  });

  it('waits a full gap after a decline', () => {
    const once = recordPushOffer(never, T0);
    expect(shouldOfferPush('undetermined', once, T0 + PUSH_OFFER_GAP_MS - 1)).toBe(false);
    expect(shouldOfferPush('undetermined', once, T0 + PUSH_OFFER_GAP_MS)).toBe(true);
  });

  it('stops for good after the last offer', () => {
    let h = never;
    for (let i = 0; i < PUSH_OFFER_MAX; i++) h = recordPushOffer(h, T0);
    expect(h.count).toBe(PUSH_OFFER_MAX);
    expect(shouldOfferPush('undetermined', h, T0 + 100 * PUSH_OFFER_GAP_MS)).toBe(false);
  });
});
