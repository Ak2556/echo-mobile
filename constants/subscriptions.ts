/**
 * Subscription plan definitions.
 *
 * Used by:
 *   - lib/purchases.ts (returns the user's current plan)
 *   - supabase/functions/echo-ai (applies the right rate-limit ceiling)
 *   - app/upgrade.tsx (renders the paywall card)
 *
 * Pro plan IDs match the App Store Connect product identifiers. Keep the
 * `id` strings stable — they're how RevenueCat / StoreKit looks up entitlements.
 */

export interface PlanDefinition {
  /** App Store / Play / RevenueCat product identifier. Must be unique. */
  id: string;
  /** Display name shown in the upgrade screen. */
  name: string;
  /** Monthly price in `currency`. Free plan = 0. */
  price: number;
  /** ISO-4217 currency code. */
  currency: 'USD';
  /** Per-day AI request ceiling. -1 means unlimited. */
  aiRequestsPerDay: number;
  /** Whether the user can publish posts to the public feed. */
  canPublishPosts: boolean;
  /** Max saved chats kept in history. -1 means unlimited. */
  maxSavedChats: number;
}

export type PlanId = 'free' | 'pro';

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Echo Free',
    price: 0,
    currency: 'USD',
    aiRequestsPerDay: 10,
    canPublishPosts: true,
    maxSavedChats: 20,
  },
  pro: {
    id: 'echo_pro_monthly',
    name: 'Echo Pro',
    price: 4.99,
    currency: 'USD',
    aiRequestsPerDay: 100,
    canPublishPosts: true,
    maxSavedChats: -1,
  },
} as const;

export const FREE_PLAN = PLANS.free;
export const PRO_PLAN = PLANS.pro;
