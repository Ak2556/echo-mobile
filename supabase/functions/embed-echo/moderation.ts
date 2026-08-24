// Content moderation gate.
//
// Anything the AI is about to publish to the public feed (compose_post,
// comment_on_post, …) — and anything a user publishes that embed-echo picks
// up — is run through a moderation classifier first. If it flags, we refuse to
// surface the row and let the caller present a neutral error to the user.
//
// We route moderation through OpenRouter (the same provider Echo already uses
// for chat) so the deployment only needs ONE secret: OPENROUTER_API_KEY. There
// is no dedicated /v1/moderations endpoint on OpenRouter, so we use a small,
// cheap chat model (Gemini Flash-Lite via google-ai-studio) as a zero-shot
// classifier that returns a strict JSON verdict.
//
// The same classifier also looks at uploaded images: moderateImages() sends
// them as image_url parts to the vision-capable model, so photos go through the
// same fail-closed gate as text rather than reaching the feed unexamined.
//
// OPENROUTER_API_KEY must be set in Supabase Edge Function Secrets — never
// shipped in the mobile bundle.

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
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return { ok: false, categories: ["moderation_unavailable"], error: "OPENROUTER_API_KEY unset" };
  }
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { ok: true, categories: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Moderation",
      },
      body: JSON.stringify({
        model: MODERATION_MODEL,
        provider: { only: ["google-ai-studio"] },
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, categories: ["moderation_unavailable"], error: `moderation http ${res.status}` };
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
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

/**
 * Parse the classifier's JSON verdict defensively. Models sometimes wrap JSON
 * in markdown fences or add stray text, so we extract the first {...} block.
 * Returns null when no valid verdict can be recovered (caller fails open).
 */
function parseVerdict(content: string): { flagged: boolean; categories: string[] } | null {
  if (!content) return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(content.slice(start, end + 1));
    const flagged = obj?.flagged === true;
    const categories = Array.isArray(obj?.categories)
      ? obj.categories.filter((c: unknown): c is string => typeof c === "string")
      : [];
    return { flagged, categories };
  } catch {
    return null;
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
export async function moderateImages(urls: string[]): Promise<ModerationResult> {
  if (urls.length === 0) return { ok: true, categories: [] };

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return { ok: false, categories: ["moderation_unavailable"], error: "OPENROUTER_API_KEY unset" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            content: urls.slice(0, MAX_IMAGES_PER_CALL).map((url) => ({
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
