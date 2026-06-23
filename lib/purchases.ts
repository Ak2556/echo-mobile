/**
 * Subscription / IAP facade.
 *
 * Subscription facade. The current implementation returns `'free'` until
 * App Store purchases are connected.
 *
 * When integrating, swap the `getCurrentPlan` body to call:
 *   - RevenueCat: `Purchases.getCustomerInfo()` → check `entitlements.active`
 *   - StoreKit 2 direct: `Transaction.currentEntitlements`
 *   - Stripe (web only): server-side subscription lookup
 */

import { PLANS, type PlanId } from '../constants/subscriptions';

/** Returns the user's active plan id. Always returns 'free' in v1. */
export async function getCurrentPlan(): Promise<PlanId> {
  return 'free';
}

export function isPro(plan: PlanId): boolean {
  return plan === 'pro' || plan === 'founder';
}

export function isPaid(plan: PlanId): boolean {
  return plan === 'plus' || plan === 'pro' || plan === 'founder';
}

/**
 * Returns the per-hour AI request ceiling for a plan. The Edge Function
 * mirrors this plan catalog in `supabase/functions/_shared/rateLimit.ts`.
 */
export function aiRequestsPerHour(plan: PlanId): number {
  return PLANS[plan].aiRequestsPerHour;
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
