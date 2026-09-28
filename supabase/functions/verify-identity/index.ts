// verify-identity — face verification for the verified badge.
//
// Actions (POST, authenticated):
//   submit  { selfie_path, pose }  — user submitted a pose-challenge selfie.
//             Gemini compares it with the profile photo: liveness, same
//             person, pose. Confident verdicts auto-approve/reject; anything
//             ambiguous stays pending for a moderator. If the model is
//             unavailable the request is retried from the job queue. Decided
//             selfies are deleted immediately (the selfie exists only to verify).
//   status  {}                     — latest request for the caller.
//   list    {}                     — moderator: pending queue with signed
//                                    selfie URLs for review.
//   decide  { request_id, approve }— moderator decision; flips
//                                    profiles.is_verified and deletes the
//                                    selfie either way.
//
// profiles.is_verified is written exclusively here with the service role —
// no client path can grant the badge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { spendActionBudget } from "../_shared/actionLimit.ts";
import { judgeRequest, removeSelfie as removeSelfieFrom } from "./judge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const removeSelfie = (path: string) => removeSelfieFrom(service, path);

async function setVerified(userId: string, verified: boolean): Promise<void> {
  await service.from("profiles").update({ is_verified: verified }).eq("id", userId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const action = String(body.action ?? "submit");

  const { data: me } = await service
    .from("profiles")
    .select("id, is_verified, is_moderator, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return json({ error: "Profile not found" }, 404);

  // ── status ────────────────────────────────────────────────────────────────
  if (action === "status") {
    const { data: reqRow } = await service
      .from("verification_requests")
      .select("status, reject_reason, created_at, decided_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return json({ is_verified: me.is_verified, request: reqRow ?? null });
  }

  // ── submit ────────────────────────────────────────────────────────────────
  if (action === "submit") {
    if (me.is_verified) return json({ status: "approved", already: true });
    if (!me.avatar_url) return json({ error: "no_avatar" }, 400);

    const selfiePath = String(body.selfie_path ?? "");
    const pose = String(body.pose ?? "").slice(0, 60);
    if (!selfiePath.startsWith(`${user.id}/`)) return json({ error: "Bad selfie path" }, 400);

    // Each submission is a vision-model call. Five a day is room for a few
    // failed poses, not for grinding the model until it says yes.
    const budget = await spendActionBudget(user.id, [
      { action: "verify_identity_day", limit: 5, windowSeconds: 86400 },
    ]);
    if (!budget.ok) {
      return json(
        { error: budget.status === 429 ? "too_many_attempts" : "unavailable", retryAfter: budget.retryAfterSeconds },
        budget.status,
      );
    }

    // Replace any previous pending request (and its stored selfie).
    const { data: pending } = await service
      .from("verification_requests")
      .select("id, selfie_path")
      .eq("user_id", user.id)
      .eq("status", "pending");
    for (const p of pending ?? []) {
      if (p.selfie_path !== selfiePath) await removeSelfie(p.selfie_path);
      await service.from("verification_requests").delete().eq("id", p.id);
    }

    const { data: reqRow, error: insErr } = await service
      .from("verification_requests")
      .insert({ user_id: user.id, selfie_path: selfiePath, pose })
      .select("id")
      .single();
    if (insErr || !reqRow) return json({ error: "Could not create request" }, 500);

    const outcome = await judgeRequest(service, reqRow.id);
    if (outcome.status === "unavailable") {
      // The model could not judge it now. Queue a retry (with backoff, then
      // the dead-letter queue) rather than leaving it for a moderator who may
      // never look; the user sees "pending" either way.
      const { error: qErr } = await service.rpc("jobs_enqueue", {
        p_queue: "verification",
        p_msg: { request_id: reqRow.id },
      });
      if (qErr) console.error("[verify-identity] could not queue a retry:", qErr.message);
      return json({ status: "pending", reason: "Queued for human review." });
    }
    if (outcome.status === "superseded") return json({ status: "pending", reason: "Queued for human review." });
    return json(outcome);
  }

  // ── moderator actions ─────────────────────────────────────────────────────
  if (!me.is_moderator) return json({ error: "Moderators only" }, 403);

  if (action === "list") {
    const { data: rows } = await service
      .from("verification_requests")
      .select("id, user_id, selfie_path, pose, ai_verdict, created_at, profiles:user_id (username, display_name, avatar_url)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    const out = [];
    for (const r of rows ?? []) {
      const { data: signed } = await service.storage
        .from("verification")
        .createSignedUrl(r.selfie_path, 3600);
      out.push({ ...r, selfie_url: signed?.signedUrl ?? null });
    }
    return json({ requests: out });
  }

  if (action === "decide") {
    const requestId = String(body.request_id ?? "");
    const approve = !!body.approve;
    const { data: reqRow } = await service
      .from("verification_requests")
      .select("id, user_id, selfie_path, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) return json({ error: "Request not found" }, 404);
    if (reqRow.status !== "pending") return json({ error: "Already decided" }, 409);

    // Pending-only, like the model's decisions, so two reviewers (or a
    // reviewer and a queued retry) cannot both decide it.
    const { data: decided } = await service.from("verification_requests").update({
      status: approve ? "approved" : "rejected",
      reviewed_by: user.id,
      reject_reason: approve ? null : "A reviewer couldn't confirm the selfie matches your profile.",
      decided_at: new Date().toISOString(),
    }).eq("id", requestId).eq("status", "pending").select("id");
    if (!decided?.length) return json({ error: "Already decided" }, 409);
    if (approve) await setVerified(reqRow.user_id, true);
    await removeSelfie(reqRow.selfie_path);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
