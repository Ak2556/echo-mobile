// Per-user budgets for edge functions that spend AI credits.
//
// Counted by public.check_app_rate_limit, called with the service role. The
// function refuses these action names from client roles, so a user cannot reset
// their own counter the way they could before 20260916120000.
//
// Without a budget, one scripted account could drain the model balance. That
// matters beyond cost: moderation is fail-closed, so an empty balance stops
// every post from publishing.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

let admin: SupabaseClient | null = null;

export interface ActionBudget {
  action: string;
  limit: number;
  windowSeconds: number;
}

export type LimitResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; retryAfterSeconds?: number };

/**
 * Count one call against every budget, all at once. The caller must already
 * have verified `userId` from the JWT. A forged id would spend someone else's
 * budget.
 *
 * Fails closed. If the counter cannot be written the call does not go ahead,
 * which is the same choice embed-echo and echo-ai make.
 */
export async function spendActionBudget(userId: string, budgets: ActionBudget[]): Promise<LimitResult> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return { ok: false, status: 503 };
  admin ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const client = admin;

  const results = await Promise.all(
    budgets.map((b) =>
      client.rpc("check_app_rate_limit", {
        p_action: b.action,
        p_limit: b.limit,
        p_window_seconds: b.windowSeconds,
        p_user_id: userId,
      }),
    ),
  );

  for (const { error } of results) {
    if (!error) continue;
    // rate_limit_exceeded:<action>:<limit>:<retry_after_seconds>
    const match = /^rate_limit_exceeded:[^:]*:[^:]*:(\d+)/.exec(error.message ?? "");
    if (match) return { ok: false, status: 429, retryAfterSeconds: Number(match[1]) };
    console.error("[actionLimit] counter unavailable:", error.message);
    return { ok: false, status: 503 };
  }
  return { ok: true };
}
