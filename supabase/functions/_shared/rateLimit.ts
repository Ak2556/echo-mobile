// Shared per-user hourly rate limiter for AI edge functions.
//
// Backed by the `ai_rate_limits` table. A single row per user tracks the
// start of the current rolling-hour window and the request count inside it.
// The window rotates on the first request after expiry.
//
// Used by: echo-ai, editorial-rewrite (and any future AI function).
// Fail-open: a transient DB error never blocks the user — we log and allow.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const FREE_LIMIT = 30;
export const PRO_LIMIT = 200;
export const WINDOW_MS = 60 * 60 * 1000;

/**
 * Resolve the per-user request ceiling.
 * v1 ships everyone on the free plan. When IAP launches, query
 * `profiles.plan` here and return PRO_LIMIT for paying users.
 */
export async function resolveLimitForUser(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<number> {
  // TODO(payments): SELECT plan FROM profiles WHERE id = _userId; if 'pro' → PRO_LIMIT.
  return FREE_LIMIT;
}

export class AIRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Rate limit reached. Try again in an hour.");
    this.name = "AIRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Check the user's rate limit and increment the counter.
 * Throws `AIRateLimitError` when the user is over budget.
 * Fail-open on read/write errors so a transient DB blip never locks AI for everyone.
 */
export async function checkAndIncrementRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limit: number = FREE_LIMIT,
): Promise<void> {
  let windowStartIso: string;
  let count: number;

  try {
    const { data: row, error } = await supabase
      .from("ai_rate_limits")
      .select("window_start, request_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[rateLimit] read failed, failing open:", error.message);
      return;
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
      throw new AIRateLimitError(retryAfter);
    }

    const { error: upErr } = await supabase
      .from("ai_rate_limits")
      .upsert(
        { user_id: userId, window_start: windowStartIso, request_count: count + 1 },
        { onConflict: "user_id" },
      );
    if (upErr) {
      console.warn("[rateLimit] upsert failed, failing open:", upErr.message);
    }
  } catch (e) {
    if (e instanceof AIRateLimitError) throw e;
    console.warn("[rateLimit] unexpected, failing open:", e instanceof Error ? e.message : String(e));
  }
}
