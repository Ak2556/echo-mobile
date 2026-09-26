// Ops probe — asks whether Echo still works, not whether its jobs ran.
//
// Every monitor before this one measured the machine: cron_health passes when
// each job ran recently and no 4xx was logged in the last two hours. Server-side
// moderation was dead from 2026-08-21 to 2026-09-22 and every check stayed
// green the whole time, because with little traffic the broken path made no
// calls, and a path that is never called never fails.
//
// So this probe asserts outcomes instead:
//
//   moderation  — run a real classification. Proves the provider answers, the
//                 quota is not spent, and the model id is still served. This is
//                 the check that would have caught the month-long outage, the
//                 credit-less OpenRouter account, and a delisted model.
//   stuck_posts — count posts that are still hidden with no verdict recorded
//                 twenty minutes after they were written. Uses real user posts,
//                 so it needs no synthetic content in anyone's feed.
//
// A failure pushes straight to the moderators' devices, because the GitHub
// healthcheck asks for every fifteen minutes and is throttled to every three to
// five hours, and it reports by opening an issue nobody is paged by.
//
// Called by pg_cron with x-ops-probe-secret. Deploy with --no-verify-jwt is not
// needed: the cron sends the Vault service key as Authorization for the gateway,
// exactly as push-fanout does, and this function trusts only the secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";
import { moderateContent } from "../embed-echo/moderation.ts";
import {
  alertBody,
  interpretModeration,
  interpretStuck,
  overallStatus,
  shouldAlert as shouldAlertFrom,
  stuckWindow,
  type CheckResult,
  type ProbeRunRow,
} from "./policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROBE_SECRET = Deno.env.get("OPS_PROBE_SECRET") ?? "";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-ops-probe-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * One real classification. The text is deliberately ordinary: a "safe" verdict
 * is the expected answer, and anything else — a flag, an unparseable reply, a
 * quota error — means the gate in front of every published post is not working.
 */
async function checkModeration(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const verdict = await moderateContent("A quiet walk after lunch, and the day felt lighter.");
    return interpretModeration(verdict, Date.now() - started);
  } catch (e) {
    return { check: "moderation", ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// deno-lint-ignore no-explicit-any
async function checkStuckPosts(supabase: any): Promise<CheckResult> {
  const window = stuckWindow(Date.now());
  const { count, error } = await supabase
    .from("public_echoes")
    .select("id", { count: "exact", head: true })
    .eq("check_content", false)
    .is("moderated_at", null)
    .gt("created_at", window.since)
    .lt("created_at", window.before);
  return interpretStuck(count ?? null, error ? error.message : null);
}

/**
 * Push to every moderator's devices. Deliberately carries no `kind`, so an
 * installed build shows the banner and its tap handler ignores it rather than
 * routing somewhere that does not exist.
 */
// deno-lint-ignore no-explicit-any
async function alertModerators(supabase: any, failures: CheckResult[]): Promise<number> {
  const { data: mods } = await supabase.from("profiles").select("id").eq("is_moderator", true);
  const ids = (mods ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return 0;

  const { data: tokens } = await supabase.from("push_tokens").select("token").in("user_id", ids);
  const list = (tokens ?? []).map((t: { token: string }) => t.token).filter(Boolean);
  if (!list.length) return 0;

  const body = alertBody(failures);
  const payload = list.map((to: string) => ({
    to,
    title: "Echo probe failed",
    body,
    sound: "default",
    priority: "high",
    channelId: "system",
  }));

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("[ops-probe] expo push failed:", res.status, (await res.text()).slice(0, 200));
    return 0;
  }
  return list.length;
}

/** This check's recent history, newest first, for the alert decision in policy.ts. */
// deno-lint-ignore no-explicit-any
async function shouldAlert(supabase: any, check: string): Promise<boolean> {
  const { data } = await supabase
    .from("probe_runs")
    .select("ok, alerted, ran_at")
    .eq("check_name", check)
    .order("ran_at", { ascending: false })
    .limit(20);
  return shouldAlertFrom((data ?? []) as ProbeRunRow[], Date.now());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provided = req.headers.get("x-ops-probe-secret") ?? "";
  if (!PROBE_SECRET || !provided || !(await timingSafeEqual(provided, PROBE_SECRET))) {
    return json({ error: "forbidden" }, 403);
  }
  if (!SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const results: CheckResult[] = [];
  results.push(await checkStuckPosts(supabase));
  results.push(await checkModeration());

  const outcome = overallStatus(results);
  const failures = outcome.failures;
  let alerted = false;
  let pushed = 0;
  if (failures.length) {
    const wanted = await Promise.all(failures.map((f) => shouldAlert(supabase, f.check)));
    if (wanted.some(Boolean)) {
      pushed = await alertModerators(supabase, failures);
      alerted = true;
    }
  }

  // Written last so the alert decision above reads the previous run, not this one.
  const { error: writeError } = await supabase.from("probe_runs").insert(
    results.map((r) => ({ check_name: r.check, ok: r.ok, detail: r.detail, alerted: alerted && !r.ok })),
  );
  if (writeError) console.error("[ops-probe] could not record run:", writeError.message);

  return json({
    ok: outcome.ok,
    checks: results,
    alerted,
    devices_notified: pushed,
  }, outcome.status);
});
