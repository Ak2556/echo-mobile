// editorial-rewrite — one-shot text transforms for the Share Echo editor
// ("Make clearer", "Shorten", "Turn into insight", "Add hook",
// "Remove private details"). Invoked from app/share.tsx.
//
// Uses the same OpenRouter / Gemini Flash setup as echo-ai so we don't ship
// an API key to the client. Non-streaming: returns JSON `{ text }`.
//
// Security parity with echo-ai: requires a real authenticated user (the public
// anon key alone is NOT enough — we call auth.getUser()), and each call counts
// against the same per-user hourly AI budget (ai_rate_limits table).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { checkAndIncrementRateLimit, AIRateLimitError } from "../_shared/rateLimit.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const MODEL = Deno.env.get("EDITORIAL_REWRITE_MODEL") ?? "google/gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Hard ceiling on how long we'll wait for OpenRouter before giving up.
const UPSTREAM_TIMEOUT_MS = 20_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "clarify" | "shorten" | "insight" | "hook" | "privacy";

const ACTION_INSTRUCTIONS: Record<Action, string> = {
  clarify:
    "Rewrite the text to be clearer and easier to scan on a phone. Fix awkward phrasing, tighten run-on sentences, and preserve the author's voice. Do not add new claims or facts.",
  shorten:
    "Tighten the text to roughly half its current length without losing the core point. Preserve the author's voice. Cut redundancy and filler; keep concrete details.",
  insight:
    "Rewrite the text as a single sharp takeaway or insight — the kind of statement someone would quote. Open with the insight directly. One short paragraph max.",
  hook:
    "Rewrite the text with a strong one-sentence hook at the very top that makes the reader want to keep reading. Keep the rest of the text intact below the hook.",
  privacy:
    "Rewrite the text to remove personal/private details: full names of private individuals, email addresses, phone numbers, street addresses, employer names, and anything that could identify a specific person. Replace with neutral wording. Preserve the substance of the point.",
};

interface Body {
  action?: string;
  text?: string;
  prompt?: string;
}

function json(status: number, payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });
}


async function rewrite(action: Action, text: string, prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");

  const instruction = ACTION_INSTRUCTIONS[action];
  const system =
    "You are a precise text editor for a social app called Echo. " +
    "Return ONLY the rewritten text — no preface, no commentary, no quotes around it, no markdown headers. " +
    "Preserve the author's voice and meaning. Never invent facts.";

  const user =
    `Task: ${instruction}\n\n` +
    (prompt.trim() ? `Context (original question / prompt the text answers):\n"""${prompt.trim()}"""\n\n` : "") +
    `Text to rewrite:\n"""${text}"""`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Editorial Rewrite",
      },
      body: JSON.stringify({
        model: MODEL,
        provider: { only: ["google-ai-studio"] },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("The rewrite timed out. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${detail}`);
  }
  const data = await res.json();
  const out = data?.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) {
    throw new Error("Empty response from model");
  }
  // Models occasionally wrap the result in matching triple quotes — strip them.
  return out
    .trim()
    .replace(/^"{3}\s*/, "")
    .replace(/\s*"{3}$/, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // ── Auth: require a real signed-in user, not just the public anon key ───────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Missing auth" });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return json(401, { error: "Invalid auth" });
  }
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const action = body.action as Action | undefined;
  const text = (body.text ?? "").trim();
  const prompt = (body.prompt ?? "").toString();

  if (!action || !(action in ACTION_INSTRUCTIONS)) {
    return json(400, { error: `Unknown action: ${action}` });
  }
  if (!text) return json(400, { error: "text is required" });
  if (text.length > 8000) return json(400, { error: "text too long (max 8000 chars)" });

  // ── Rate limit (shared AI budget) ───────────────────────────────────────────
  try {
    await checkAndIncrementRateLimit(supabase, userId);
  } catch (e) {
    if (e instanceof AIRateLimitError) {
      return json(429, { error: e.message }, { "Retry-After": String(e.retryAfterSeconds) });
    }
    throw e;
  }

  try {
    const rewritten = await rewrite(action, text, prompt);
    return json(200, { text: rewritten });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[editorial-rewrite]", message);
    return json(500, { error: message });
  }
});
