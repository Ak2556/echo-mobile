// Content moderation gate.
//
// Anything the AI is about to publish to the public feed (compose_post,
// comment_on_post, …) — and anything a user publishes that embed-echo picks
// up — is run through a moderation classifier first. If it flags, we refuse to
// surface the row and let the caller present a neutral error to the user.
//
// Text moderation goes through _shared/aiChat.ts (Gemini direct, OpenRouter
// fallback), using a small, cheap chat model (Gemini Flash-Lite) as a
// zero-shot classifier that returns a strict JSON verdict.
//
// The same classifier also looks at uploaded images: moderateImages() sends
// them as image_url parts to the vision-capable model, so photos go through the
// same fail-closed gate as text rather than reaching the feed unexamined. That
// call stays on OpenRouter: it passes remote image URLs, which Google's
// OpenAI-compatible endpoint is not confirmed to fetch.
//
// Keys (GEMINI_API_KEY, OPENROUTER_API_KEY) live in Supabase Edge Function
// Secrets — never shipped in the mobile bundle.

import { chatCompletion, geminiModelId, hasChatProvider } from "../_shared/aiChat.ts";
import { guardedFetch } from "../_shared/breaker.ts";
import { videoMimeType } from "./mediaKinds.ts";
import { parseVerdict } from "./verdict.ts";
import {
  blockReason,
  extractGeminiText,
  fileRequestBody,
  inlineRequestBody,
  toBase64,
  videoRoute,
  MAX_VIDEO_BYTES,
} from "./videoModeration.ts";

export interface ModerationResult {
  /** True when the content is safe to publish. */
  ok: boolean;
  /** Category names that were flagged, if any. Empty when ok=true. */
  categories: string[];
  /** Raw error string when the moderation call itself fails. */
  error?: string;
}

// Cheap, fast classifier. Routed through google-ai-studio to match the rest of
// the Echo AI stack. Overridable via env for tuning without a redeploy.
const MODERATION_MODEL =
  Deno.env.get("MODERATION_MODEL") ?? "google/gemini-2.5-flash-lite";
// Same family, and multimodal — it accepts image_url parts. Separate constant
// so the vision model can be tuned without touching text moderation.
const VISION_MODEL =
  Deno.env.get("MODERATION_VISION_MODEL") ?? "google/gemini-2.5-flash-lite";
const MODERATION_TIMEOUT_MS = 8000;
// A vision call carries whole images, so give it longer than the text gate.
const VISION_TIMEOUT_MS = 20000;
// Enough to cover an ordinary multi-photo post without unbounded cost on one
// call. Anything beyond this is reported as unchecked rather than ignored.
const MAX_IMAGES_PER_CALL = 4;

// Categories the classifier may return. Mirrors OpenAI's moderation taxonomy so
// any persisted audit data stays comparable to the prior implementation.
const CATEGORIES = [
  "sexual",
  "sexual/minors",
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "violence",
  "violence/graphic",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "illicit",
  "illicit/violent",
] as const;

const SYSTEM_PROMPT =
  "You are a strict but fair content-moderation classifier for a public social " +
  "feed. Decide whether the user-supplied text is safe to publish. Flag content " +
  "only if it clearly falls into one of these categories: " +
  CATEGORIES.join(", ") +
  ". Ordinary opinions, profanity, politics, and edgy-but-legal speech are NOT " +
  'violations. Respond with ONLY a compact JSON object of the form ' +
  '{"flagged": boolean, "categories": string[]}. The categories array lists the ' +
  "matched category names (empty when flagged is false). Output no prose.";

/**
 * Returns ok=true when the text is safe to publish, ok=false otherwise.
 *
 * If the moderation call fails, return ok=false so public content stays hidden
 * until the user retries or an operator reviews the incident.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  if (!hasChatProvider()) {
    return { ok: false, categories: ["moderation_unavailable"], error: "no AI provider key set" };
  }
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { ok: true, categories: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
  try {
    const { content } = await chatCompletion({
      model: MODERATION_MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed.slice(0, 4000) },
      ],
      signal: controller.signal,
      title: "Echo Moderation",
    });
    const verdict = parseVerdict(content);
    if (!verdict) {
      return { ok: false, categories: ["moderation_unavailable"], error: "moderation: unparseable verdict" };
    }

    if (verdict.flagged) {
      return { ok: false, categories: verdict.categories };
    }
    return { ok: true, categories: [] };
  } catch (e) {
    return {
      ok: false,
      categories: ["moderation_unavailable"],
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

const VISION_SYSTEM_PROMPT =
  "You are a strict but fair content-moderation classifier for a public social " +
  "feed. Decide whether the attached image(s) are safe to publish. Flag only if " +
  "an image clearly falls into one of these categories: " +
  CATEGORIES.join(", ") +
  ". Ordinary photography, art, swimwear, medical or educational imagery, and " +
  "edgy-but-legal content are NOT violations. Sexual content involving anyone " +
  "who appears to be a minor must always be flagged as sexual/minors. Respond " +
  'with ONLY a compact JSON object of the form {"flagged": boolean, ' +
  '"categories": string[]}. Output no prose.';

/**
 * Classify uploaded images.
 *
 * Same contract and same failure semantics as moderateContent: ok=false with
 * "moderation_unavailable" means the gate could not reach a verdict, which the
 * caller treats as "leave pending and retry" rather than as a rejection.
 *
 * Images are sent by URL. Echo's media is publicly readable through the
 * Cloudflare worker, so the model fetches them directly and the function never
 * has to download and re-encode megabytes of image data.
 */
async function moderateImageChunk(urls: string[]): Promise<ModerationResult> {
  if (urls.length === 0) return { ok: true, categories: [] };

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return { ok: false, categories: ["moderation_unavailable"], error: "OPENROUTER_API_KEY unset" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await guardedFetch("openrouter", "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Moderation",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        provider: { only: ["google-ai-studio"] },
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: urls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, categories: ["moderation_unavailable"], error: `vision http ${res.status}` };
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const verdict = parseVerdict(content);
    if (!verdict) {
      return { ok: false, categories: ["moderation_unavailable"], error: "vision: unparseable verdict" };
    }
    return verdict.flagged
      ? { ok: false, categories: verdict.categories }
      : { ok: true, categories: [] };
  } catch (e) {
    return {
      ok: false,
      categories: ["moderation_unavailable"],
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify uploaded images, at most MAX_IMAGES_PER_CALL per model call.
 *
 * This used to send the first four and silently ignore the rest, so the fifth
 * photo of a listing (up to six are allowed) was never looked at. Every chunk is
 * judged; the first one that is flagged or unavailable decides.
 */
export async function moderateImages(urls: string[]): Promise<ModerationResult> {
  for (let i = 0; i < urls.length; i += MAX_IMAGES_PER_CALL) {
    const result = await moderateImageChunk(urls.slice(i, i + MAX_IMAGES_PER_CALL));
    if (!result.ok) return result;
  }
  return { ok: true, categories: [] };
}

// ── Video ───────────────────────────────────────────────────────────────────

const GEMINI_API = "https://generativelanguage.googleapis.com";
// Native Gemini id (no "google/" prefix): this call bypasses OpenRouter.
const VIDEO_MODEL = geminiModelId(Deno.env.get("MODERATION_VIDEO_MODEL") ?? "gemini-2.5-flash-lite");
// Fetching, uploading, waiting for the file to process and generating all have
// to fit in one worker invocation.
const VIDEO_TIMEOUT_MS = 100_000;
const FILE_POLL_INTERVAL_MS = 2_000;
const FILE_POLL_MAX_MS = 60_000;

const VIDEO_SYSTEM_PROMPT =
  "You are a strict but fair content-moderation classifier for a public social " +
  "feed. Decide whether the attached video, including its audio and any spoken " +
  "words, is safe to publish. Flag only if it clearly falls into one of these " +
  "categories: " +
  CATEGORIES.join(", ") +
  ". Ordinary footage, sport, dance, swimwear, medical or educational content, " +
  "news, and edgy-but-legal content are NOT violations. Sexual content involving " +
  "anyone who appears to be a minor must always be flagged as sexual/minors. " +
  'Respond with ONLY a compact JSON object of the form {"flagged": boolean, ' +
  '"categories": string[]}. Output no prose.';

const unavailableResult = (error: string): ModerationResult => ({
  ok: false,
  categories: ["moderation_unavailable"],
  error,
});

/** Upload bytes through the resumable Files API; resolves once the file is ACTIVE. */
async function uploadToGeminiFiles(
  apiKey: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
  signal: AbortSignal,
): Promise<{ name: string; uri: string }> {
  const start = await fetch(`${GEMINI_API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "echo-moderation" } }),
    signal,
  });
  if (!start.ok) throw new Error(`files start http ${start.status}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("files start: no upload url");

  const put = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
    signal,
  });
  if (!put.ok) throw new Error(`files upload http ${put.status}`);
  let file = (await put.json())?.file;
  if (!file?.name || !file?.uri) throw new Error("files upload: unexpected response");

  const deadline = Date.now() + FILE_POLL_MAX_MS;
  while (file.state !== "ACTIVE") {
    if (file.state === "FAILED") throw new Error("files: processing failed");
    if (Date.now() > deadline) throw new Error("files: timed out waiting for ACTIVE");
    await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS));
    const poll = await fetch(`${GEMINI_API}/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": apiKey },
      signal,
    });
    if (!poll.ok) throw new Error(`files poll http ${poll.status}`);
    file = await poll.json();
  }
  return { name: file.name, uri: file.uri };
}

async function moderateOneVideo(url: string, apiKey: string, signal: AbortSignal): Promise<ModerationResult> {
  const mimeType = videoMimeType(url);
  if (!mimeType) return unavailableResult("video: unsupported container");

  const res = await fetch(url, { signal });
  if (!res.ok) return unavailableResult(`video fetch http ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  // Refuse before reading a body that cannot be legitimate. The bucket caps
  // uploads, so an oversized file is hidden, not retried.
  if (declared > MAX_VIDEO_BYTES) return { ok: false, categories: ["video_too_large"] };
  const bytes = new Uint8Array(await res.arrayBuffer());
  const route = videoRoute(bytes.length);
  if (route === "too_large") return { ok: false, categories: ["video_too_large"] };

  let uploaded: { name: string; uri: string } | null = null;
  try {
    let requestBody;
    if (route === "inline") {
      requestBody = inlineRequestBody({ systemPrompt: VIDEO_SYSTEM_PROMPT, mimeType, base64: toBase64(bytes) });
    } else {
      uploaded = await uploadToGeminiFiles(apiKey, bytes, mimeType, signal);
      requestBody = fileRequestBody({ systemPrompt: VIDEO_SYSTEM_PROMPT, mimeType, fileUri: uploaded.uri });
    }

    const gen = await guardedFetch("gemini", `${GEMINI_API}/v1beta/models/${VIDEO_MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal,
    });
    if (!gen.ok) return unavailableResult(`video generate http ${gen.status}`);

    const json = await gen.json();
    // A video the model refuses to look at is blocked, not clean.
    const blocked = blockReason(json);
    if (blocked) return { ok: false, categories: [`blocked:${blocked}`] };

    const verdict = parseVerdict(extractGeminiText(json));
    if (!verdict) return unavailableResult("video: unparseable verdict");
    return verdict.flagged ? { ok: false, categories: verdict.categories } : { ok: true, categories: [] };
  } finally {
    if (uploaded) {
      // Best effort: uploads expire on their own after 48 hours.
      fetch(`${GEMINI_API}/v1beta/${uploaded.name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey } })
        .catch(() => {});
    }
  }
}

/**
 * Classify uploaded videos with Gemini's native video input.
 *
 * Same contract and failure semantics as moderateImages: ok=false with
 * "moderation_unavailable" means no verdict was reached, which the caller
 * treats as "leave pending and retry"; any other ok=false hides the post.
 * The first flagged video decides; every video must pass for ok=true.
 */
export async function moderateVideos(urls: string[]): Promise<ModerationResult> {
  if (urls.length === 0) return { ok: true, categories: [] };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return unavailableResult("GEMINI_API_KEY unset (video moderation needs Gemini directly)");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIDEO_TIMEOUT_MS);
  try {
    for (const url of urls) {
      const result = await moderateOneVideo(url, apiKey, controller.signal);
      if (!result.ok) return result;
    }
    return { ok: true, categories: [] };
  } catch (e) {
    return unavailableResult(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

