import { describe, expect, it } from 'vitest';
import { PLANS } from '../constants/subscriptions';
import { aiRequestsPerHour, canSaveMoreChats, isPaid, isPro } from './purchases';

describe('subscription tiers', () => {
  it('orders AI capacity by tier', () => {
    expect(aiRequestsPerHour('free')).toBeLessThan(aiRequestsPerHour('plus'));
    expect(aiRequestsPerHour('plus')).toBeLessThan(aiRequestsPerHour('pro'));
    expect(aiRequestsPerHour('pro')).toBeLessThan(aiRequestsPerHour('founder'));
  });

  it('treats founder as exclusive pro-level access', () => {
    expect(PLANS.founder.exclusive).toBe(true);
    expect(isPro('founder')).toBe(true);
    expect(isPaid('founder')).toBe(true);
  });

  it('keeps free bounded while paid tiers can expand saved chats', () => {
    expect(canSaveMoreChats('free', PLANS.free.maxSavedChats)).toBe(false);
    expect(canSaveMoreChats('pro', 10_000)).toBe(true);
    expect(canSaveMoreChats('founder', 10_000)).toBe(true);
  });
});
