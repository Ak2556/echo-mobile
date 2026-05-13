// embed-echo — generate a 768-d embedding + thoughtfulness score for a
// published echo and persist them on public_echoes.
//
// Invoked fire-and-forget from the client after insertRemoteEcho returns
// (see lib/supabaseEchoApi.ts → triggerEmbedEcho). Also safe to backfill:
// re-running on a populated row will overwrite with a fresh embedding.
//
// Embeddings come from Google Gemini text-embedding-004 (768-dim), routed
// via OpenRouter to keep API key handling consistent with the chat function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIM = 768;
const EMBEDDING_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

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
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(`${EMBEDDING_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType: "SEMANTIC_SIMILARITY",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const values = json?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape (len=${values?.length ?? 'n/a'})`);
  }
  return values;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let echoId: string;
  try {
    const body = await req.json();
    echoId = String(body?.echo_id ?? "");
    if (!echoId) throw new Error("echo_id required");
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: row, error: fetchErr } = await supabase
    .from("public_echoes")
    .select("id, title, prompt, response, conversation_snapshot")
    .eq("id", echoId)
    .single();
  if (fetchErr || !row) {
    return new Response(
      JSON.stringify({ error: fetchErr?.message ?? "echo not found" }),
      { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const text = buildEmbeddingText(row as EchoRow);
  if (!text.trim()) {
    return new Response(JSON.stringify({ ok: false, reason: "empty text" }), {
      status: 200,
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

  const thoughtfulness = computeThoughtfulnessScore(row as EchoRow);

  // pgvector accepts the textual form '[v1,v2,...]'.
  const vectorLiteral = `[${embedding.join(",")}]`;
  const { error: updateErr } = await supabase
    .from("public_echoes")
    .update({
      embedding: vectorLiteral,
      thoughtfulness_score: thoughtfulness,
    })
    .eq("id", echoId);
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, dim: embedding.length, thoughtfulness }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
