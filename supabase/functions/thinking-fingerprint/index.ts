// thinking-fingerprint — synthesise a short portrait of how a user thinks from
// their published echoes (text + 768-d embeddings).
//
// Two signals are combined:
//   1. An embedding-derived "range" metric: how spread-out a user's echoes are
//      in semantic space (focused thinker ↔ wide-ranging thinker).
//   2. An LLM synthesis: archetype, themes, reasoning style, and a signature
//      question, derived from a digest of the user's echo content.
//
// The synthesis is expensive, so results are cached in thinking_fingerprints
// and only regenerated when the user's echo_count changes or the row goes stale
// (>14 days). Pass { force: true } to bypass the cache.
//
// Routed through OpenRouter (google-ai-studio) so the only secret is
// OPENROUTER_API_KEY — the same key used by chat, moderation, and embeddings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

const SYNTH_MODEL = Deno.env.get("FINGERPRINT_MODEL") ?? "google/gemini-2.0-flash-001";
const SYNTH_TIMEOUT_MS = 15000;
const MIN_ECHOES = 3;
const MAX_ECHOES = 24;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EchoRow {
  id: string;
  title: string | null;
  prompt: string;
  response: string;
  embedding: string | number[] | null;
}

interface Fingerprint {
  archetype: string;
  summary: string;
  themes: string[];
  reasoning_style: string;
  signature_question: string;
  range: number; // 0..100 embedding spread; low = focused, high = wide-ranging
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

/** pgvector columns come back as the string "[v1,v2,…]" via PostgREST. */
function parseVector(v: string | number[] | null): number[] | null {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return null;
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

/**
 * "Range" = mean cosine distance of each echo from the user's centroid. A
 * tightly clustered author (always circling the same ideas) scores low; an
 * author whose echoes roam across topics scores high. Scaled to a 0–100 readout.
 */
function computeRange(vectors: number[][]): number {
  if (vectors.length < 2) return 0;
  const dim = vectors[0].length;
  const normed = vectors.map(l2normalize);
  const centroid = new Array(dim).fill(0);
  for (const v of normed) for (let i = 0; i < dim; i++) centroid[i] += v[i];
  for (let i = 0; i < dim; i++) centroid[i] /= normed.length;
  const cNorm = l2normalize(centroid);
  let total = 0;
  for (const v of normed) {
    let dot = 0;
    for (let i = 0; i < dim; i++) dot += v[i] * cNorm[i];
    total += 1 - dot; // cosine distance
  }
  const mean = total / normed.length;
  return Math.max(0, Math.min(100, Math.round(mean * 150)));
}

function buildDigest(rows: EchoRow[]): string {
  const lines: string[] = [];
  for (const r of rows) {
    const head = (r.title || r.prompt || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const body = (r.response || "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (head || body) lines.push(`- ${head}${body ? `: ${body}` : ""}`);
  }
  return lines.join("\n").slice(0, 4000);
}

const SYSTEM_PROMPT =
  "You are an insightful analyst. Given a list of a person's published " +
  "AI-conversation excerpts ('echoes'), infer how this person thinks. Be " +
  "specific and honest, not flattering filler. Respond with ONLY a compact JSON " +
  "object of the form " +
  '{"archetype": string, "summary": string, "themes": string[], "reasoning_style": string, "signature_question": string}. ' +
  "archetype: a 2-4 word label for their intellectual style (e.g. 'Systems-minded skeptic'). " +
  "summary: 2-3 sentences describing how they think and what they're drawn to. " +
  "themes: 3-6 short topic tags (1-2 words each). " +
  "reasoning_style: one sentence on HOW they reason (e.g. 'tests ideas against edge cases'). " +
  "signature_question: one question this person seems to keep returning to. " +
  "Output no prose outside the JSON.";

function coerceFingerprint(content: string, range: number): Fingerprint | null {
  if (!content) return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const themes = Array.isArray(obj.themes)
    ? obj.themes.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 28)).filter(Boolean).slice(0, 6)
    : [];
  const archetype = str(obj.archetype, 48);
  const summary = str(obj.summary, 600);
  if (!archetype && !summary) return null;
  return {
    archetype: archetype || "Original thinker",
    summary,
    themes,
    reasoning_style: str(obj.reasoning_style, 200),
    signature_question: str(obj.signature_question, 200),
    range,
  };
}

async function synthesize(digest: string, range: number): Promise<Fingerprint | null> {
  if (!OPENROUTER_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTH_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Thinking Fingerprint",
      },
      body: JSON.stringify({
        model: SYNTH_MODEL,
        provider: { only: ["google-ai-studio"] },
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Here are the person's echoes:\n\n${digest}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    return coerceFingerprint(content, range);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  let userId = "";
  let force = false;
  try {
    const body = await req.json();
    userId = String(body?.user_id ?? "");
    force = body?.force === true;
    if (!userId) throw new Error("user_id required");
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Require a valid user session. Cross-user reads are allowed (fingerprints
  // are derived from public echoes), but unauthenticated callers are rejected
  // to prevent profile enumeration and unwanted LLM synthesis costs.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authorization required" }, 401);
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData.user) return json({ error: "invalid authorization" }, 401);

  // How many moderated echoes does this user have? (cache key)
  const { count: echoCount } = await supabase
    .from("public_echoes")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId)
    .eq("check_content", true);
  const total = echoCount ?? 0;

  if (total < MIN_ECHOES) {
    return json({ ready: false, echo_count: total });
  }

  // Serve from cache when fresh and the echo count is unchanged.
  if (!force) {
    const { data: cached } = await supabase
      .from("thinking_fingerprints")
      .select("data, echo_count, generated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (cached) {
      const fresh = Date.now() - new Date((cached as { generated_at: string }).generated_at).getTime() < CACHE_TTL_MS;
      if (fresh && (cached as { echo_count: number }).echo_count === total) {
        return json({ ready: true, echo_count: total, cached: true, ...(cached as { data: Fingerprint }).data });
      }
    }
  }

  // Pull the most recent echoes for analysis.
  const { data: rows, error } = await supabase
    .from("public_echoes")
    .select("id, title, prompt, response, embedding")
    .eq("author_id", userId)
    .eq("check_content", true)
    .order("created_at", { ascending: false })
    .limit(MAX_ECHOES);
  if (error) return json({ error: error.message }, 500);

  const echoes = (rows ?? []) as EchoRow[];
  const vectors = echoes.map((e) => parseVector(e.embedding)).filter((v): v is number[] => Array.isArray(v) && v.length > 0);
  const range = computeRange(vectors);

  const digest = buildDigest(echoes);
  const fingerprint = await synthesize(digest, range);
  if (!fingerprint) {
    return json({ ready: false, echo_count: total, error: "synthesis unavailable" });
  }

  // Cache it (best-effort; a failed write just means we recompute next time).
  await supabase
    .from("thinking_fingerprints")
    .upsert({ user_id: userId, data: fingerprint, echo_count: total, generated_at: new Date().toISOString() }, { onConflict: "user_id" });

  return json({ ready: true, echo_count: total, cached: false, ...fingerprint });
});
