// Judge the other places users upload pictures: marketplace listings and
// profile avatars. The echo equivalent is judge.ts; the worker's
// 'media_moderation' queue calls these.
//
// Listings are gated (marketplace_listings.check_content, owned by a trigger);
// avatars are not, because profiles.avatar_url is read through too many paths
// to gate. A failed avatar is cleared instead, which falls back to the coloured
// initial. See 20261004120000_media_moderation_listings_avatars.sql.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { moderateContent, moderateImages, type ModerationResult } from "./moderation.ts";
import { splitHttpUrls } from "./mediaKinds.ts";

export type MediaJudgeResult =
  | { kind: "not_found" }
  /** The content changed (or was already judged) since this job was queued; a newer job decides. */
  | { kind: "superseded" }
  | { kind: "unavailable"; error?: string }
  | { kind: "verdict_not_saved"; error: string }
  | { kind: "passed" }
  | { kind: "flagged"; categories: string[] };

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

const unavailable = (v: { ok: boolean; categories: string[] }) =>
  !v.ok && v.categories.includes("moderation_unavailable");

export async function judgeListing(db: Db, id: string): Promise<MediaJudgeResult> {
  const { data: row, error } = await db
    .from("marketplace_listings")
    .select("id, title, description, tags, photo_urls, content_version, moderated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { kind: "unavailable", error: error.message };
  if (!row) return { kind: "not_found" };
  // An edit clears moderated_at, so a value here means this version already has
  // a verdict: a duplicate job, not work.
  if (row.moderated_at) return { kind: "superseded" };

  let verdict: ModerationResult = { ok: true, categories: [] };

  const text = [row.title, row.description, ...(row.tags ?? [])].filter(Boolean).join("\n");
  const textVerdict = await moderateContent(text);
  if (unavailable(textVerdict)) return { kind: "unavailable", error: textVerdict.error };
  if (!textVerdict.ok) verdict = textVerdict;

  // Only spend the vision call if the text passed.
  if (verdict.ok) {
    const { fetchable, unfetchable } = splitHttpUrls(row.photo_urls);
    if (unfetchable.length > 0) {
      // A photo the model cannot fetch is a photo nobody checked.
      verdict = { ok: false, categories: ["unverifiable_media"] };
    } else if (fetchable.length > 0) {
      const imageVerdict = await moderateImages(fetchable);
      if (unavailable(imageVerdict)) return { kind: "unavailable", error: imageVerdict.error };
      if (!imageVerdict.ok) verdict = { ok: false, categories: imageVerdict.categories.map((c) => `image:${c}`) };
    }
  }

  // Written for the version that was read. An edit while the model was thinking
  // bumps content_version, this matches no row, and the newer job decides.
  const { data: judged, error: writeErr } = await db
    .from("marketplace_listings")
    .update({ check_content: verdict.ok, moderated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("content_version", row.content_version)
    .select("id");
  if (writeErr) return { kind: "verdict_not_saved", error: writeErr.message };
  if (!judged?.length) return { kind: "superseded" };

  if (!verdict.ok) {
    console.warn(`[media-moderation] listing ${id} hidden:`, verdict.categories.join(", "));
    return { kind: "flagged", categories: verdict.categories };
  }
  return { kind: "passed" };
}

export async function judgeAvatar(db: Db, userId: string, url: string): Promise<MediaJudgeResult> {
  const { data: row, error } = await db
    .from("profiles")
    .select("id, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { kind: "unavailable", error: error.message };
  if (!row) return { kind: "not_found" };
  // The picture changed again since this job was queued; its own job judges that one.
  if (row.avatar_url !== url) return { kind: "superseded" };

  const { fetchable } = splitHttpUrls([url]);
  let verdict: ModerationResult;
  if (fetchable.length === 0) {
    verdict = { ok: false, categories: ["unverifiable_media"] };
  } else {
    verdict = await moderateImages(fetchable);
    if (unavailable(verdict)) return { kind: "unavailable", error: verdict.error };
  }
  if (verdict.ok) return { kind: "passed" };

  // Clear it only if it is still the picture that was judged.
  const { error: clearErr } = await db
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", userId)
    .eq("avatar_url", url);
  if (clearErr) return { kind: "verdict_not_saved", error: clearErr.message };
  console.warn(`[media-moderation] avatar of ${userId} cleared:`, verdict.categories.join(", "));
  return { kind: "flagged", categories: verdict.categories };
}
