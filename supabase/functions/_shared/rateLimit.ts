// Shared per-user hourly rate limiter for AI edge functions.
//
// Counted by public.check_app_rate_limit (action 'ai_chat_hour', one row per
// user in app_rate_limits), which locks the user's row while it counts. The
// counter used to be read and then upserted from here, so N concurrent
// requests all read the same count and all wrote count + 1: a burst of fifty
// spent fifty calls against a counter of one, on the quota whose exhaustion
// also stops moderation.
//
// Used by: echo-ai, editorial-rewrite, and other AI functions.
// Counter-storage errors fail closed so rate limits cannot be bypassed by a
// broken RLS policy, missing migration, or unavailable write path.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { spendActionBudget } from "./actionLimit.ts";

export type PlanId = "free" | "plus" | "pro" | "founder";

export interface RateLimitTier {
  planId: PlanId;
  label: string;
  limitPerHour: number;
  exclusive: boolean;
}

export const RATE_LIMIT_TIERS: Record<PlanId, RateLimitTier> = {
  free: { planId: "free", label: "Echo Free", limitPerHour: 30, exclusive: false },
  plus: { planId: "plus", label: "Echo Plus", limitPerHour: 100, exclusive: false },
  pro: { planId: "pro", label: "Echo Pro", limitPerHour: 250, exclusive: false },
  founder: { planId: "founder", label: "Echo Founder", limitPerHour: 600, exclusive: true },
};

export const FREE_LIMIT = RATE_LIMIT_TIERS.free.limitPerHour;
export const WINDOW_MS = 60 * 60 * 1000;

const PLAN_PRIORITY: Record<PlanId, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  founder: 3,
};

function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "plus" || value === "pro" || value === "founder";
}

function isActiveEntitlement(row: { status?: string | null; current_period_end?: string | null }): boolean {
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (!row.current_period_end) return true;
  return new Date(row.current_period_end).getTime() > Date.now();
}

/**
 * Resolve the per-user plan and request ceiling from server-trusted
 * entitlements. Unknown/missing entitlements fall back to Free.
 */
export async function resolveLimitForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<RateLimitTier> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("plan_id, status, exclusive, current_period_end")
    .eq("user_id", userId);

  if (error) {
    console.warn("[rateLimit] entitlement read failed; using Free:", error.message);
    return RATE_LIMIT_TIERS.free;
  }

  const rows = (data ?? [])
    .filter(isActiveEntitlement)
    .filter((row) => isPlanId(row.plan_id));

  if (!rows.length) return RATE_LIMIT_TIERS.free;

  const best = rows.sort((a, b) => PLAN_PRIORITY[b.plan_id as PlanId] - PLAN_PRIORITY[a.plan_id as PlanId])[0];
  const plan = best.plan_id as PlanId;
  return {
    ...RATE_LIMIT_TIERS[plan],
    exclusive: Boolean(best.exclusive) || RATE_LIMIT_TIERS[plan].exclusive,
  };
}

export class AIRateLimitError extends Error {
  retryAfterSeconds: number;
  tier: RateLimitTier;
  constructor(retryAfterSeconds: number, tier: RateLimitTier) {
    super(`Rate limit reached for ${tier.label} (${tier.limitPerHour}/hour). Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min.`);
    this.name = "AIRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.tier = tier;
  }
}

/**
 * Check the user's rate limit and increment the counter, atomically.
 * Throws `AIRateLimitError` when the user is over budget.
 *
 * `_supabase` is unused: the counter runs through the shared service-role
 * client in actionLimit.ts. Kept so callers need no change.
 */
export async function checkAndIncrementRateLimit(
  _supabase: SupabaseClient,
  userId: string,
  tier: RateLimitTier = RATE_LIMIT_TIERS.free,
): Promise<void> {
  const limit = tier.limitPerHour;
  if (limit < 0) return;
  const r = await spendActionBudget(userId, [{ action: "ai_chat_hour", limit, windowSeconds: WINDOW_MS / 1000 }]);
  if (r.ok) return;
  if (r.status === 429) throw new AIRateLimitError(r.retryAfterSeconds ?? 60, tier);
  // Fails closed: an unavailable counter must not become an unlimited one.
  throw new Error("Rate limit unavailable");
}
