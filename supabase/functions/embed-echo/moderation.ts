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
  Deno.env.get("MODERATION_MODEL") ?? "google/gemini-2.0-flash-lite-001";
const MODERATION_TIMEOUT_MS = 8000;

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
 * Fail-open policy: if the moderation call itself errors (network, 5xx,
 * missing key, malformed output), we return ok=true and log the reason. We'd
 * rather publish occasionally-flaggable content than block legitimate users
 * behind a third-party outage. The trade-off is intentional and documented.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return { ok: true, categories: [], error: "OPENROUTER_API_KEY unset — skipping moderation" };
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
      return { ok: true, categories: [], error: `moderation http ${res.status}` };
    }

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const verdict = parseVerdict(content);
    if (!verdict) {
      return { ok: true, categories: [], error: "moderation: unparseable verdict" };
    }

    if (verdict.flagged) {
      return { ok: false, categories: verdict.categories };
    }
    return { ok: true, categories: [] };
  } catch (e) {
    return {
      ok: true,
      categories: [],
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
