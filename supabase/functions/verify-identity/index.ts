// verify-identity — face verification for the verified badge.
//
// Actions (POST, authenticated):
//   submit  { selfie_path, pose }  — user submitted a pose-challenge selfie.
//             Gemini compares it with the profile photo: liveness, same
//             person, pose. Confident verdicts auto-approve/reject; anything
//             ambiguous stays pending for a moderator. Decided selfies are
//             deleted immediately (privacy: the selfie exists only to verify).
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const VISION_MODEL = Deno.env.get("VERIFY_VISION_MODEL") ?? "google/gemini-2.5-flash";

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

interface Verdict {
  live_selfie: boolean;
  same_person: boolean;
  pose_matches: boolean;
  confidence: number;
  reason: string;
}

async function judgeSelfie(avatarUrl: string, selfieUrl: string, pose: string): Promise<Verdict> {
  const prompt =
    `You are a photo-verification reviewer for a social app. Image 1 is the user's profile photo. ` +
    `Image 2 is a selfie they just took; they were asked to pose: "${pose}". ` +
    `Answer STRICT JSON only, no markdown: {"live_selfie": boolean (image 2 is a real live selfie of a human, ` +
    `not a photo of a screen/photo/AI render), "same_person": boolean (the same person appears in both images), ` +
    `"pose_matches": boolean (the selfie roughly performs the requested pose), ` +
    `"confidence": number 0-1 (your overall confidence in these answers), ` +
    `"reason": string (one short sentence)}. Be strict about live_selfie and same_person; ` +
    `be lenient about pose_matches (roughly is fine).`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: avatarUrl } },
          { type: "image_url", image_url: { url: selfieUrl } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`vision model ${res.status}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("unparseable verdict");
  const v = JSON.parse(match[0]);
  return {
    live_selfie: !!v.live_selfie,
    same_person: !!v.same_person,
    pose_matches: !!v.pose_matches,
    confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0)),
    reason: String(v.reason ?? "").slice(0, 300),
  };
}

async function removeSelfie(path: string): Promise<void> {
  await service.storage.from("verification").remove([path]).catch(() => {});
}

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

    const { data: signed } = await service.storage
      .from("verification")
      .createSignedUrl(selfiePath, 300);
    if (!signed?.signedUrl) return json({ error: "Selfie not found" }, 400);

    let verdict: Verdict;
    try {
      verdict = await judgeSelfie(me.avatar_url, signed.signedUrl, pose);
    } catch {
      // Vision unavailable — leave the request pending for a moderator rather
      // than failing the user or writing a false verdict.
      return json({ status: "pending", reason: "Queued for human review." });
    }

    const confident = verdict.confidence >= 0.75;
    if (confident && verdict.live_selfie && verdict.same_person && verdict.pose_matches) {
      await service.from("verification_requests").update({
        status: "approved", ai_verdict: verdict, decided_at: new Date().toISOString(),
      }).eq("id", reqRow.id);
      await setVerified(user.id, true);
      await removeSelfie(selfiePath);
      return json({ status: "approved" });
    }
    if (confident && (!verdict.live_selfie || !verdict.same_person)) {
      const reason = !verdict.live_selfie
        ? "The photo doesn't look like a live selfie."
        : "The selfie doesn't appear to match your profile photo.";
      await service.from("verification_requests").update({
        status: "rejected", ai_verdict: verdict, reject_reason: reason,
        decided_at: new Date().toISOString(),
      }).eq("id", reqRow.id);
      await removeSelfie(selfiePath);
      return json({ status: "rejected", reason });
    }
    await service.from("verification_requests").update({ ai_verdict: verdict }).eq("id", reqRow.id);
    return json({ status: "pending", reason: "Queued for human review." });
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

    await service.from("verification_requests").update({
      status: approve ? "approved" : "rejected",
      reviewed_by: user.id,
      reject_reason: approve ? null : "A reviewer couldn't confirm the selfie matches your profile.",
      decided_at: new Date().toISOString(),
    }).eq("id", requestId);
    if (approve) await setVerified(reqRow.user_id, true);
    await removeSelfie(reqRow.selfie_path);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
