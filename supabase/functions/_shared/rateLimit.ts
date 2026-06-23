// Shared per-user hourly rate limiter for AI edge functions.
//
// Backed by the `ai_rate_limits` table. A single row per user tracks the
// start of the current rolling-hour window and the request count inside it.
// The window rotates on the first request after expiry.
//
// Used by: echo-ai, editorial-rewrite, and other AI functions.
// Counter-storage errors fail closed so rate limits cannot be bypassed by a
// broken RLS policy, missing migration, or unavailable write path.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
 * Check the user's rate limit and increment the counter.
 * Throws `AIRateLimitError` when the user is over budget.
 */
export async function checkAndIncrementRateLimit(
  supabase: SupabaseClient,
  userId: string,
  tier: RateLimitTier = RATE_LIMIT_TIERS.free,
): Promise<void> {
  const limit = tier.limitPerHour;
  if (limit < 0) return;

  let windowStartIso: string;
  let count: number;

  try {
    const { data: row, error } = await supabase
      .from("ai_rate_limits")
      .select("window_start, request_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw error;
    }

    const now = Date.now();
    const previousStart = row ? new Date(row.window_start).getTime() : now;
    const inWindow = row ? now - previousStart < WINDOW_MS : false;
    count = inWindow ? (row?.request_count ?? 0) : 0;
    windowStartIso = inWindow
      ? (row!.window_start as string)
      : new Date(now).toISOString();

    if (inWindow && count >= limit) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - previousStart)) / 1000);
      throw new AIRateLimitError(retryAfter, tier);
    }

    const { error: upErr } = await supabase
      .from("ai_rate_limits")
      .upsert(
        {
          user_id: userId,
          window_start: windowStartIso,
          request_count: count + 1,
          plan_id: tier.planId,
          limit_per_hour: limit,
          updated_at: new Date(now).toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (upErr) {
      throw upErr;
    }
  } catch (e) {
    if (e instanceof AIRateLimitError) throw e;
    throw new Error(`Rate limit unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
}
