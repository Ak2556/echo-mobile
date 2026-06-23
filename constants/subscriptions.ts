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
  /** Per-hour AI request ceiling. -1 means unlimited. */
  aiRequestsPerHour: number;
  /** Whether the user can publish posts to the public feed. */
  canPublishPosts: boolean;
  /** Max saved chats kept in history. -1 means unlimited. */
  maxSavedChats: number;
  /** How much of Echo's personal persona layer this plan unlocks. */
  personaDepth: 'personal' | 'deep' | 'replica';
  /** Invite-only or manually granted plan. */
  exclusive: boolean;
  /** Short plan positioning line for paywalls and settings. */
  tagline: string;
}

export type PlanId = 'free' | 'plus' | 'pro' | 'founder';

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Echo Free',
    price: 0,
    currency: 'USD',
    aiRequestsPerHour: 30,
    canPublishPosts: true,
    maxSavedChats: 20,
    personaDepth: 'personal',
    exclusive: false,
    tagline: 'Personal Echo with thoughtful limits.',
  },
  plus: {
    id: 'echo_plus_monthly',
    name: 'Echo Plus',
    price: 2.99,
    currency: 'USD',
    aiRequestsPerHour: 100,
    canPublishPosts: true,
    maxSavedChats: 100,
    personaDepth: 'deep',
    exclusive: false,
    tagline: 'More room for daily thinking and deeper personalization.',
  },
  pro: {
    id: 'echo_pro_monthly',
    name: 'Echo Pro',
    price: 4.99,
    currency: 'USD',
    aiRequestsPerHour: 250,
    canPublishPosts: true,
    maxSavedChats: -1,
    personaDepth: 'replica',
    exclusive: false,
    tagline: 'Your 24/7 personal persona with high-capacity AI.',
  },
  founder: {
    id: 'echo_founder',
    name: 'Echo Founder',
    price: 0,
    currency: 'USD',
    aiRequestsPerHour: 600,
    canPublishPosts: true,
    maxSavedChats: -1,
    personaDepth: 'replica',
    exclusive: true,
    tagline: 'Invite-only access with the highest Echo capacity.',
  },
} as const;

export const FREE_PLAN = PLANS.free;
export const PLUS_PLAN = PLANS.plus;
export const PRO_PLAN = PLANS.pro;
export const FOUNDER_PLAN = PLANS.founder;
