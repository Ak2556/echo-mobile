// backfill-embeddings — one-off (re-runnable) backfill that fills in the
// `embedding` column for echoes published before embeddings were wired up.
//
// Processes a batch per invocation and returns how many rows still need
// embedding, so a caller can loop until { remaining: 0 }. Uses the service
// role and runs entirely server-side. Embeddings are generated through
// OpenRouter (same key as chat/moderation/embed-echo), 768-dim to match the
// vector(768) column.
//
// POST body: { "limit"?: number }  (default 20, max 50)

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

interface EchoRow {
  id: string;
  title: string | null;
  prompt: string;
  response: string;
  conversation_snapshot: { role: string; content: string }[] | null;
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
  return parts.join("\n\n").slice(0, 6000);
}

function computeThoughtfulness(row: EchoRow): number {
  const snapshotLen = Array.isArray(row.conversation_snapshot) ? row.conversation_snapshot.length : 0;
  const depth = Math.min(1, Math.log10(snapshotLen + 1) / 1.1);
  const responseLen = (row.response || "").length;
  const substance = Math.min(1, responseLen / 1500);
  return Number((depth * 0.55 + substance * 0.45).toFixed(4));
}

async function generateEmbedding(text: string, model: string, dims: number | null): Promise<number[]> {
  const body: Record<string, unknown> = { model, input: text };
  if (dims != null) body.dimensions = dims;
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo Embeddings Backfill",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Embedding API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const values = json?.data?.[0]?.embedding;
  if (!Array.isArray(values)) {
    throw new Error(`Unexpected embedding shape (len=${values?.length ?? "n/a"})`);
  }
  return values;
}

const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Admin-only ops tool — reject all callers that don't know the secret.
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let limit = 20;
  let model = EMBEDDING_MODEL;
  let dims: number | null = EMBEDDING_DIM;
  let probe = false;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body?.limit === "number") limit = Math.max(1, Math.min(50, body.limit));
  if (typeof body?.model === "string" && body.model) model = body.model;
  if (body?.dims === null || typeof body?.dims === "number") dims = body.dims as number | null;
  if (body?.probe === true) probe = true;

  // Probe mode: test a model slug end-to-end without touching the DB.
  if (probe) {
    try {
      const v = await generateEmbedding("hello world, this is a probe.", model, dims);
      return new Response(JSON.stringify({ ok: true, model, dims, len: v.length }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, model, dims, error: e instanceof Error ? e.message : String(e) }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rows, error: fetchErr } = await supabase
    .from("public_echoes")
    .select("id, title, prompt, response, conversation_snapshot")
    .is("embedding", null)
    .limit(limit);
  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const batch = (rows ?? []) as EchoRow[];
  let processed = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of batch) {
    const text = buildEmbeddingText(row);
    if (!text.trim()) continue;
    try {
      const embedding = await generateEmbedding(text, model, dims);
      if (embedding.length !== EMBEDDING_DIM) {
        failures.push({ id: row.id, error: `dim mismatch: got ${embedding.length}, want ${EMBEDDING_DIM}` });
        continue;
      }
      const { error: updErr } = await supabase
        .from("public_echoes")
        .update({
          embedding: `[${embedding.join(",")}]`,
          thoughtfulness_score: computeThoughtfulness(row),
        })
        .eq("id", row.id);
      if (updErr) failures.push({ id: row.id, error: updErr.message });
      else processed++;
    } catch (e) {
      failures.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // How many still need embedding after this batch.
  const { count: remaining } = await supabase
    .from("public_echoes")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return new Response(
    JSON.stringify({ processed, failed: failures.length, failures: failures.slice(0, 5), remaining: remaining ?? null }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
