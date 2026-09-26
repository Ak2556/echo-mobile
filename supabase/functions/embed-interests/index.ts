// Put the interests people chose into the same vector space as their posts.
//
// The first attempt seeded a new user's taste by matching interest words
// against post text. Measured on the real corpus, every interest matched zero
// posts: 83 short posts rarely contain the word "philosophy" even when that is
// what they are about. Keyword matching was the wrong mechanism.
//
// So each interest label is embedded once with the same model that embeds
// posts, and a person's starting taste is the average of the labels they
// picked. Labels are few and stable, so this is a handful of calls that then
// serve every new account for free.
//
// Guarded by a shared secret and called by cron; it is a no-op once every
// label in use has a vector.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const PROBE_SECRET = Deno.env.get("OPS_PROBE_SECRET") ?? "";
const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") ?? "google/gemini-embedding-001";
const EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_DIM = 768;
/** One run's ceiling, so a flood of new labels cannot spend the whole quota at once. */
const MAX_PER_RUN = 40;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-ops-probe-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * "mental-health" is a slug, not a sentence. Embedding it as a short phrase
 * about the topic puts it nearer to posts that discuss the thing than to posts
 * that happen to contain the word.
 */
function labelToText(label: string): string {
  return `Writing about ${label.replace(/[-_]+/g, " ").trim()}.`;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo Interest Embeddings",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, dimensions: EMBEDDING_DIM }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const values = (await res.json())?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape (len=${values?.length ?? "n/a"})`);
  }
  return values;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const provided = req.headers.get("x-ops-probe-secret") ?? "";
  if (!PROBE_SECRET || !provided || !(await timingSafeEqual(provided, PROBE_SECRET))) {
    return json({ error: "forbidden" }, 403);
  }
  if (!OPENROUTER_API_KEY) return json({ error: "OPENROUTER_API_KEY not configured" }, 500);
  if (!SERVICE_ROLE_KEY) return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Labels people actually chose, plus any the caller names explicitly, minus
  // the ones already embedded.
  let wanted: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.labels)) wanted = body.labels.filter((l: unknown) => typeof l === "string");
  } catch { /* body is optional */ }

  const { data: chosen, error: chosenError } = await supabase.from("user_interests").select("interest");
  if (chosenError) return json({ error: `could not read interests: ${chosenError.message}` }, 500);
  for (const row of chosen ?? []) wanted.push((row as { interest: string }).interest);

  const { data: known } = await supabase.from("interest_embeddings").select("interest");
  const have = new Set((known ?? []).map((r: { interest: string }) => r.interest));
  const todo = [...new Set(wanted)].filter((l) => l && !have.has(l)).slice(0, MAX_PER_RUN);

  const embedded: string[] = [];
  const failed: { interest: string; error: string }[] = [];
  for (const label of todo) {
    try {
      const vector = await embed(labelToText(label));
      const { error } = await supabase
        .from("interest_embeddings")
        .upsert({ interest: label, embedding: JSON.stringify(vector), updated_at: new Date().toISOString() },
                { onConflict: "interest" });
      if (error) throw new Error(error.message);
      embedded.push(label);
    } catch (e) {
      failed.push({ interest: label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Anyone whose taste was waiting on one of these can now be seeded.
  if (embedded.length) {
    const { data: affected } = await supabase
      .from("user_interests")
      .select("user_id")
      .in("interest", embedded);
    const users = [...new Set((affected ?? []).map((r: { user_id: string }) => r.user_id))];
    for (const uid of users) {
      const { error } = await supabase.rpc("refresh_user_taste", { p_user_id: uid });
      if (error) console.warn("[embed-interests] taste refresh failed for one user:", error.message);
    }
  }

  return json({ ok: failed.length === 0, embedded, failed, pending: Math.max(0, [...new Set(wanted)].filter((l) => !have.has(l)).length - todo.length) });
});
