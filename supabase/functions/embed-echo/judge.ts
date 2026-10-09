// Judge one echo: moderate its text and images, record the verdict for the
// exact version judged, then embed it if it passed.
//
// Shared by the embed-echo endpoint (the author's app) and the job worker (the
// 'moderation' queue, fed by the moderate_new_echo trigger). Returns what
// happened instead of an HTTP response, so each caller decides what a result
// means: the endpoint maps it to a status code, the worker to ack or retry.
//
// MODERATION GATE: rows are shown in the public feed only when
// check_content = true (get_ranked_feed / get_semantic_feed and the
// chronological fallback). New rows default to false; this flips them to true
// once the content passes. If moderation is unavailable the row stays hidden
// and pending, and the caller retries.

import { moderationTextFor } from "./moderationText.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { moderateContent, moderateImages, moderateVideos } from "./moderation.ts";
import { videoModerationEnabled } from "./videoModeration.ts";
import { splitMediaForModeration } from "./mediaKinds.ts";
import { guardedFetch } from "../_shared/breaker.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

// Most videos one post may carry through the video gate. The composer attaches
// one; more than this can only come from a hand-built request, and is hidden
// rather than waved through.
const MAX_VIDEOS_PER_POST = 3;

// Embeddings are routed through OpenRouter (same key as chat + moderation) so
// the deployment needs only OPENROUTER_API_KEY. gemini-embedding-001 supports
// dimension reduction, so we request 768 dims to match the vector(768) column
// and the <=> operators used by get_semantic_feed / get_thinking_partners.
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") ?? "google/gemini-embedding-001";
const EMBEDDING_DIM = 768;
const EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";

interface EchoRow {
  id: string;
  author_id: string;
  title: string | null;
  prompt: string;
  response: string;
  conversation_snapshot: { role: string; content: string }[] | null;
  media_urls: string[] | null;
  media_alt: string[] | null;
  content_version: number;
}

export type JudgeResult =
  | { kind: "not_found"; error: string }
  | { kind: "unavailable" }
  | { kind: "verdict_not_saved"; error: string }
  | { kind: "superseded" }
  | { kind: "flagged"; categories: string[] }
  | { kind: "empty" }
  | { kind: "embed_failed"; error: string }
  | { kind: "embedding_not_saved"; error: string }
  | { kind: "embedded"; dim: number; thoughtfulness: number };

export interface JudgeOptions {
  /**
   * Extra in-call attempts when the model is unreachable. The endpoint keeps
   * two, because its caller is an app that may not retry. The worker passes 0:
   * the queue retries with backoff, and sleeping here only holds a slot.
   */
  inlineRetries: number;
}

function buildEmbeddingText(row: EchoRow): string {
  const parts: string[] = [];
  if (row.title) parts.push(row.title);
  parts.push(row.prompt, row.response);
  if (Array.isArray(row.conversation_snapshot)) {
    for (const m of row.conversation_snapshot) {
      if (m?.content) parts.push(m.content);
    }
  }
  // Cap at ~6k chars to stay well under the embedContent token limit.
  return parts.join("\n\n").slice(0, 6000);
}

function computeThoughtfulnessScore(row: EchoRow): number {
  const snapshotLen = Array.isArray(row.conversation_snapshot)
    ? row.conversation_snapshot.length
    : 0;
  // Depth signal: longer multi-turn conversations score higher (saturates at ~12 turns).
  const depth = Math.min(1, Math.log10(snapshotLen + 1) / 1.1);
  // Substance signal: meaningful response length (saturates at ~1500 chars).
  const responseLen = (row.response || "").length;
  const substance = Math.min(1, responseLen / 1500);
  // Weighted average — depth matters slightly more than length.
  return Number((depth * 0.55 + substance * 0.45).toFixed(4));
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
  const res = await guardedFetch("openrouter", EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo Embeddings",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIM, // text-embedding-3 supports dimension reduction
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  // OpenAI-compatible shape: { data: [{ embedding: number[] }] }
  const values = json?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape (len=${values?.length ?? 'n/a'})`);
  }
  return values;
}

const unavailable = (v: { ok: boolean; categories: string[] }) =>
  !v.ok && v.categories.includes("moderation_unavailable");

// deno-lint-ignore no-explicit-any
export async function judgeEcho(db: SupabaseClient<any, any, any>, echoId: string, opts: JudgeOptions): Promise<JudgeResult> {
  const { data: row, error: fetchErr } = await db
    .from("public_echoes")
    .select("id, author_id, title, prompt, response, conversation_snapshot, media_urls, media_alt, content_version")
    .eq("id", echoId)
    .single();
  if (fetchErr || !row) return { kind: "not_found", error: fetchErr?.message ?? "echo not found" };
  const echoRow = row as EchoRow;

  // Moderation gate (runs FIRST, independent of embedding). Decide visibility
  // and persist it before doing anything that can fail.
  const moderationText = moderationTextFor(echoRow);
  let verdict = await moderateContent(moderationText);
  // Infra failure is not a verdict. If the gate is unreachable, leave the row
  // PENDING (check_content stays at its default false, no verdict written) and
  // report it, so the caller retries. Writing false here used to hide freshly
  // published posts forever after a transient provider hiccup.
  for (let attempt = 0; attempt < opts.inlineRetries && unavailable(verdict); attempt++) {
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    verdict = await moderateContent(moderationText);
  }
  if (unavailable(verdict)) {
    console.error(`[embed-echo] moderation unavailable for ${echoId}; leaving pending:`, verdict.error);
    return { kind: "unavailable" };
  }

  // Uploaded images go through the same gate. Text-only moderation used to let
  // any photo reach the feed unexamined, which is exactly what App Store
  // guideline 1.2 asks a UGC app to filter.
  //
  // Only run it when the text passed: a post already destined to stay hidden
  // does not need a second billed call.
  const split = splitMediaForModeration(echoRow.media_urls);
  const { images } = split;
  let unchecked = split.unchecked;
  if (verdict.ok && images.length > 0) {
    let imageVerdict = await moderateImages(images);
    for (let attempt = 0; attempt < opts.inlineRetries && unavailable(imageVerdict); attempt++) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      imageVerdict = await moderateImages(images);
    }
    if (unavailable(imageVerdict)) {
      console.error(`[embed-echo] image moderation unavailable for ${echoId}; leaving pending:`, imageVerdict.error);
      return { kind: "unavailable" };
    }
    verdict = imageVerdict.ok
      ? verdict
      : { ok: false, categories: imageVerdict.categories.map((c) => `image:${c}`) };
  }

  // Video goes to Gemini's native video input, behind VIDEO_MODERATION=on so a
  // deploy cannot hold every video post pending before the path has been
  // tried against a real clip. Read per call: a changed secret applies on the
  // next invocation. Off, videos are recorded as unchecked, as they always were.
  if (videoModerationEnabled(Deno.env.get("VIDEO_MODERATION"))) {
    if (verdict.ok && split.videos.length > MAX_VIDEOS_PER_POST) {
      verdict = { ok: false, categories: ["video:too_many"] };
    } else if (verdict.ok && split.videos.length > 0) {
      // No inline retries: a video call is heavy, and the worker queue already
      // retries a post left pending with backoff.
      const videoVerdict = await moderateVideos(split.videos);
      if (unavailable(videoVerdict)) {
        console.error(`[embed-echo] video moderation unavailable for ${echoId}; leaving pending:`, videoVerdict.error);
        return { kind: "unavailable" };
      }
      verdict = videoVerdict.ok
        ? verdict
        : { ok: false, categories: videoVerdict.categories.map((c) => `video:${c}`) };
    }
  } else {
    unchecked = [...unchecked, ...split.videos];
  }
  if (unchecked.length > 0) {
    // HLS manifests and unrecognised files, plus video while VIDEO_MODERATION
    // is off: a still-image model cannot read them, so they reach the feed on
    // the strength of their text alone. Logged so the gap is visible in
    // function logs rather than implied by silence.
    console.warn(`[embed-echo] ${unchecked.length} media item(s) on ${echoId} not visually checked`);
  }

  // moderated_at records that a verdict was reached, whatever it was. Without
  // it a flagged post is indistinguishable from one still waiting, and the ops
  // probe cannot tell a stuck publish path from ordinary moderation.
  //
  // The verdict is for the version read above. If the post was edited while the
  // model was thinking, content_version has moved on, this matches no row, and
  // the run for the newer text decides instead. Writing by id alone let a slow
  // run publish an edit it never saw.
  const { data: judged, error: gateErr } = await db
    .from("public_echoes")
    .update({ check_content: verdict.ok, moderated_at: new Date().toISOString() })
    .eq("id", echoId)
    .eq("content_version", echoRow.content_version)
    .select("id");
  if (gateErr) {
    // A verdict that was not recorded leaves the post pending: retry the whole
    // judgement rather than embedding a post whose visibility is undecided.
    console.error("[embed-echo] failed to set check_content:", gateErr.message);
    return { kind: "verdict_not_saved", error: gateErr.message };
  }
  if (!judged?.length) return { kind: "superseded" };
  if (!verdict.ok) {
    console.warn(`[embed-echo] echo ${echoId} flagged:`, verdict.categories.join(", "));
    // Flagged content stays hidden (check_content=false). No point embedding it.
    return { kind: "flagged", categories: verdict.categories };
  }

  const text = buildEmbeddingText(echoRow);
  if (!text.trim()) return { kind: "empty" };

  let embedding: number[];
  try {
    embedding = await generateEmbedding(text);
  } catch (err) {
    return { kind: "embed_failed", error: (err as Error).message };
  }

  const thoughtfulness = computeThoughtfulnessScore(echoRow);

  // pgvector accepts the textual form '[v1,v2,...]'.
  const vectorLiteral = `[${embedding.join(",")}]`;
  const { error: updateErr } = await db
    .from("public_echoes")
    .update({
      embedding: vectorLiteral,
      thoughtfulness_score: thoughtfulness,
    })
    .eq("id", echoId)
    // An embedding of text the post no longer has would rank it by the old words.
    .eq("content_version", echoRow.content_version);
  if (updateErr) return { kind: "embedding_not_saved", error: updateErr.message };

  return { kind: "embedded", dim: embedding.length, thoughtfulness };
}
