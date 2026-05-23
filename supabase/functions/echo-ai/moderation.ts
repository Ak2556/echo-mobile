// Content moderation gate.
//
// Anything the AI is about to publish to the public feed (compose_post,
// comment_on_post, …) is run through OpenAI's free /v1/moderations endpoint
// first. If it flags, we refuse to write the row and let the caller surface a
// neutral error to the user.
//
// Two reasons we use OpenAI's moderation instead of OpenRouter's:
//   1. It's free, low-latency, and has no per-token cost on the public model.
//   2. It returns category booleans that we can persist for audit later.
//
// OPENAI_API_KEY must be set in Supabase Edge Function Secrets — never
// shipped in the mobile bundle.

export interface ModerationResult {
  /** True when the content is safe to publish. */
  ok: boolean;
  /** Category names that were flagged, if any. Empty when ok=true. */
  categories: string[];
  /** Raw error string when the moderation call itself fails. */
  error?: string;
}

/**
 * Returns ok=true when the text is safe to publish, ok=false otherwise.
 *
 * Fail-open policy: if the moderation API itself errors (network, 5xx,
 * missing key), we return ok=true and log the reason. We'd rather publish
 * occasionally-flaggable content than block legitimate users behind a
 * third-party outage. The trade-off is intentional and documented.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return { ok: true, categories: [], error: "OPENAI_API_KEY unset — skipping moderation" };
  }
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { ok: true, categories: [] };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // omni-moderation-latest is free and covers the same categories as
        // text-moderation-stable, with multimodal support if we add images.
        model: "omni-moderation-latest",
        input: trimmed.slice(0, 4000),
      }),
    });

    if (!res.ok) {
      return { ok: true, categories: [], error: `moderation http ${res.status}` };
    }

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) {
      return { ok: true, categories: [], error: "moderation: no result" };
    }

    if (result.flagged === true) {
      const cats: string[] = Object.entries(result.categories ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      return { ok: false, categories: cats };
    }
    return { ok: true, categories: [] };
  } catch (e) {
    return {
      ok: true,
      categories: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
