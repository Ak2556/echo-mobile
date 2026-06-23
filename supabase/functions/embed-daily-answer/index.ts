// embed-daily-answer — generate a 768-d embedding for a single daily-question
// answer and persist it on daily_answers.embedding.
//
// Invoked fire-and-forget from the client after submitDailyAnswer succeeds
// (see lib/supabaseEchoApi.ts → triggerEmbedDailyAnswer). The embedding powers
// get_divergent_daily_answers, which ranks the day's answers by how far they
// sit from the consensus centroid.
//
// Embeddings are routed through OpenRouter (Google gemini-embedding-001 reduced
// to 768-dim), the same key/path used by embed-echo. The account is restricted
// to the google-ai-studio provider, so the model must be Google's.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

const EMBEDDING_MODEL = Deno.env.get("EMBEDDING_MODEL") ?? "google/gemini-embedding-001";
const EMBEDDING_DIM = 768;
const EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo Daily Answer Embeddings",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, dimensions: EMBEDDING_DIM }),
  });
  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const values = json?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape (len=${values?.length ?? "n/a"})`);
  }
  return values;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let answerId: string;
  try {
    const body = await req.json();
    answerId = String(body?.answer_id ?? "");
    if (!answerId) throw new Error("answer_id required");
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Require a valid user session.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "authorization required" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData.user) {
    return new Response(JSON.stringify({ error: "invalid authorization" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("daily_answers")
    .select("id, answer, user_id")
    .eq("id", answerId)
    .single();

  if (!fetchErr && row && (row as { user_id: string }).user_id !== authData.user.id) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
  if (fetchErr || !row) {
    return new Response(JSON.stringify({ error: fetchErr?.message ?? "answer not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const text = String((row as { answer: string }).answer ?? "").trim().slice(0, 6000);
  if (!text) {
    return new Response(JSON.stringify({ ok: false, reason: "empty text" }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: embedLimitError } = await supabase.rpc("check_app_rate_limit", {
    p_action: "embed_daily_answer_hour",
    p_limit: 20,
    p_window_seconds: 3600,
    p_user_id: authData.user.id,
  });
  if (embedLimitError) {
    return new Response(JSON.stringify({ error: "Rate limit reached. Try again later." }), {
      status: 429,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let embedding: number[];
  try {
    embedding = await generateEmbedding(text);
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { error: updateErr } = await supabase
    .from("daily_answers")
    .update({ embedding: `[${embedding.join(",")}]` })
    .eq("id", answerId);
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, dim: embedding.length }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
