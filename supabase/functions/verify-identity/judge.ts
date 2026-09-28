// Judge one pending verification request with the vision model and apply the
// verdict. Shared by the verify-identity endpoint (the user's submit) and the
// job worker ('verification' queue), which retries a request the model could
// not judge instead of leaving it for a human who may never look.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { guardedFetch } from "../_shared/breaker.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const VISION_MODEL = Deno.env.get("VERIFY_VISION_MODEL") ?? "google/gemini-2.5-flash";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface Verdict {
  live_selfie: boolean;
  same_person: boolean;
  pose_matches: boolean;
  confidence: number;
  reason: string;
}

export type Outcome =
  | { status: "approved" }
  | { status: "rejected"; reason: string }
  | { status: "pending"; reason: string }
  /** The model could not be asked or did not answer usably. Retry later. */
  | { status: "unavailable" }
  /** Decided (by a moderator, or a replacement submission) before this ran. */
  | { status: "superseded" };

const PENDING_REASON = "Queued for human review.";

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

  const res = await guardedFetch("openrouter", "https://openrouter.ai/api/v1/chat/completions", {
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

/**
 * Delete a selfie. storage.remove() reports failure in its result rather than
 * throwing, so the .catch() this used to rely on never fired, and a biometric
 * image that failed to delete stayed stored with nothing noticing. Returns
 * false on failure; the verification bucket's reconciler removes it later.
 */
export async function removeSelfie(db: Db, path: string): Promise<boolean> {
  try {
    const { error } = await db.storage.from("verification").remove([path]);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("[verify-identity] selfie not deleted:", path, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Apply a decision only while the request is still pending, so a moderator's
 * decision, or a newer submission, is never overwritten by a late verdict.
 */
async function decide(db: Db, requestId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db
    .from("verification_requests")
    .update(patch)
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  return !!data?.length;
}

export async function judgeRequest(db: Db, requestId: string): Promise<Outcome> {
  const { data: req, error } = await db
    .from("verification_requests")
    .select("id, user_id, selfie_path, pose, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!req || req.status !== "pending") return { status: "superseded" };

  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("avatar_url")
    .eq("id", req.user_id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  // Without a profile photo there is nothing to compare; a moderator decides.
  if (!profile?.avatar_url) return { status: "pending", reason: PENDING_REASON };

  const { data: signed } = await db.storage.from("verification").createSignedUrl(req.selfie_path, 300);
  if (!signed?.signedUrl) return { status: "unavailable" };

  let verdict: Verdict;
  try {
    verdict = await judgeSelfie(profile.avatar_url, signed.signedUrl, req.pose ?? "");
  } catch (e) {
    console.warn("[verify-identity] vision unavailable:", e instanceof Error ? e.message : e);
    return { status: "unavailable" };
  }

  const now = new Date().toISOString();
  const confident = verdict.confidence >= 0.75;
  if (confident && verdict.live_selfie && verdict.same_person && verdict.pose_matches) {
    if (!(await decide(db, req.id, { status: "approved", ai_verdict: verdict, decided_at: now }))) {
      return { status: "superseded" };
    }
    const { error: badgeErr } = await db.from("profiles").update({ is_verified: true }).eq("id", req.user_id);
    if (badgeErr) throw badgeErr;
    await removeSelfie(db, req.selfie_path);
    return { status: "approved" };
  }
  if (confident && (!verdict.live_selfie || !verdict.same_person)) {
    const reason = !verdict.live_selfie
      ? "The photo doesn't look like a live selfie."
      : "The selfie doesn't appear to match your profile photo.";
    if (!(await decide(db, req.id, { status: "rejected", ai_verdict: verdict, reject_reason: reason, decided_at: now }))) {
      return { status: "superseded" };
    }
    await removeSelfie(db, req.selfie_path);
    return { status: "rejected", reason };
  }
  // Answered, but not confidently: that is a question for a person.
  await db.from("verification_requests").update({ ai_verdict: verdict }).eq("id", req.id).eq("status", "pending");
  return { status: "pending", reason: PENDING_REASON };
}
