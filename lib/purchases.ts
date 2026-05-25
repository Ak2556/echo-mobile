/**
 * Subscription / IAP facade.
 *
 * v1 ships as a scaffold returning `'free'` for everyone — the surface
 * exists so the rest of the app (rate limiting, ProGate, upgrade screen)
 * can be wired now and the IAP integration can land later without
 * touching call sites.
 *
 * When integrating, swap the `getCurrentPlan` body to call:
 *   - RevenueCat: `Purchases.getCustomerInfo()` → check `entitlements.active`
 *   - StoreKit 2 direct: `Transaction.currentEntitlements`
 *   - Stripe (web only): server-side subscription lookup
 */

import { PLANS, type PlanId } from '../constants/subscriptions';

/** Returns the user's active plan id. Always returns 'free' in v1. */
export async function getCurrentPlan(): Promise<PlanId> {
  // TODO(payments): integrate with Apple IAP / RevenueCat before launching paid tier.
  return 'free';
}

export function isPro(plan: PlanId): boolean {
  return plan === 'pro';
}

/**
 * Returns the per-day AI request ceiling for a plan. The Edge Function
 * mirrors this constant (`FREE_LIMIT`/`PRO_LIMIT` in rateLimit.ts) — keep
 * the two in sync when you bump either.
 */
export function aiRequestsPerDay(plan: PlanId): number {
  return PLANS[plan].aiRequestsPerDay;
}

/**
 * Returns true when the action is allowed for the plan, false when it
 * should trigger a ProGate paywall.
 */
export function canSaveMoreChats(plan: PlanId, currentCount: number): boolean {
  const ceiling = PLANS[plan].maxSavedChats;
  if (ceiling === -1) return true;
  return currentCount < ceiling;
}
