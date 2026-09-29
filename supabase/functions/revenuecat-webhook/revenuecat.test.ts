import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { TOLERANCE_SECONDS, verifyRevenueCatSignature } from './signature';
import { entitlementFor, usersInEvent } from './entitlements';

const SECRET = 'whsec_test';
const BODY = '{"event":{"id":"e1"}}';
const NOW = 1_790_000_000;
const sign = (t: number, body = BODY, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('verifyRevenueCatSignature (RevenueCat HMAC scheme)', () => {
  it('accepts a signature over "<t>.<body>"', async () => {
    expect(await verifyRevenueCatSignature(sign(NOW), BODY, SECRET, NOW)).toEqual({ ok: true });
  });

  it('rejects a body that was changed after signing', async () => {
    expect(await verifyRevenueCatSignature(sign(NOW), BODY.replace('e1', 'e2'), SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects the scheme the old handler checked (HMAC over the body alone)', async () => {
    const bodyOnly = `t=${NOW},v1=${createHmac('sha256', SECRET).update(BODY).digest('hex')}`;
    expect((await verifyRevenueCatSignature(bodyOnly, BODY, SECRET, NOW)).ok).toBe(false);
  });

  it('rejects a timestamp outside the tolerance', async () => {
    const old = NOW - TOLERANCE_SECONDS - 1;
    expect(await verifyRevenueCatSignature(sign(old), BODY, SECRET, NOW)).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects a missing header, a missing secret, and garbage', async () => {
    expect((await verifyRevenueCatSignature(null, BODY, SECRET, NOW)).ok).toBe(false);
    expect((await verifyRevenueCatSignature(sign(NOW), BODY, '', NOW)).ok).toBe(false);
    expect(await verifyRevenueCatSignature('t=abc,v1=zz', BODY, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('entitlementFor', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  const future = '2026-10-28T00:00:00Z';
  const past = '2026-08-28T00:00:00Z';

  it('grants the highest active plan', () => {
    const row = entitlementFor({
      entitlements: {
        plus: { expires_date: future, product_identifier: 'plus_m' },
        pro: { expires_date: future, product_identifier: 'pro_m' },
      },
      subscriptions: { pro_m: { store: 'play_store', period_type: 'normal' } },
    }, now);
    expect(row).toEqual({ plan_id: 'pro', status: 'active', source: 'play_store', current_period_end: '2026-10-28T00:00:00.000Z' });
  });

  it('keeps access through a cancellation until the period ends (CANCELLATION is not expiry)', () => {
    // A cancelled subscription still carries its future expires_date.
    expect(entitlementFor({ entitlements: { pro: { expires_date: future } } }, now).plan_id).toBe('pro');
  });

  it('keeps access through a billing grace period', () => {
    const row = entitlementFor({ entitlements: { plus: { expires_date: past, grace_period_expires_date: future } } }, now);
    expect(row.plan_id).toBe('plus');
  });

  it('marks a trial as trialing, from the app store', () => {
    const row = entitlementFor({
      entitlements: { plus: { expires_date: future, product_identifier: 'p' } },
      subscriptions: { p: { store: 'app_store', period_type: 'trial' } },
    }, now);
    expect(row).toMatchObject({ status: 'trialing', source: 'app_store' });
  });

  it('writes an expired row when nothing is active, and ignores unknown identifiers', () => {
    expect(entitlementFor({ entitlements: { pro: { expires_date: past }, vip: { expires_date: future } } }, now))
      .toEqual({ plan_id: 'free', status: 'expired', source: 'app_store', current_period_end: null });
  });

  it('treats a lifetime entitlement (no expiry) as active', () => {
    expect(entitlementFor({ entitlements: { founder: { expires_date: null } } }, now))
      .toMatchObject({ plan_id: 'founder', status: 'active', current_period_end: null });
  });
});

describe('usersInEvent', () => {
  const A = '11111111-1111-1111-1111-111111111111';
  const B = '22222222-2222-2222-2222-222222222222';

  it('names both sides of a transfer, which has no app_user_id', () => {
    expect(usersInEvent({ transferred_from: [A], transferred_to: [B] }).sort()).toEqual([A, B]);
  });

  it('skips anonymous RevenueCat ids and deduplicates', () => {
    expect(usersInEvent({ app_user_id: A, original_app_user_id: '$RCAnonymousID:abc', aliases: [A] })).toEqual([A]);
  });
});
