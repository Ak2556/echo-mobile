// embed-echo — moderate a freshly-published echo, then generate a 768-d
// embedding + thoughtfulness score, and persist all of it on public_echoes.
//
// Invoked fire-and-forget from the client after insertRemoteEcho returns
// (see lib/supabaseEchoApi.ts → triggerEmbedEcho). Also safe to backfill:
// re-running on a populated row will overwrite with a fresh embedding.
//
// Embeddings come from OpenRouter's embeddings endpoint (Google
// gemini-embedding-001 reduced to 768-dim), so the only secret needed is
// OPENROUTER_API_KEY — the same key used by chat and moderation. The account is
// restricted to the google-ai-studio provider, so the model must be Google's.
//
// MODERATION GATE: rows are only shown in the public feed when
// check_content = true (enforced in get_ranked_feed / get_semantic_feed and
// the chronological fallback query). New rows default to false, so this
// function flips them true once the content passes moderation. This write is
// done FIRST and independently of embedding — embedding can fail (e.g. missing
// OPENROUTER_API_KEY) without trapping a clean post in permanent invisibility.
// Fail-open: moderateContent returns ok=true on API/key errors, matching the
// policy used by echo-ai.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { moderateContent } from "./moderation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

// Embeddings are routed through OpenRouter (same key as chat + moderation) so
// the deployment needs only OPENROUTER_API_KEY. gemini-embedding-001 supports
// dimension reduction, so we request 768 dims to match the vector(768) column
// and the <=> operators used by get_semantic_feed / get_thinking_partners.
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
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo Embeddings",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIM, // text-embedding-3 supports dimension reduction
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  // OpenAI-compatible shape: { data: [{ embedding: number[] }] }
  const values = json?.data?.[0]?.embedding;
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

  // ── Moderation gate (runs FIRST, independent of embedding) ──────────────────
  // Decide visibility and persist it before doing anything that can fail. The
  // feed only surfaces rows with check_content = true.
  const echoRow = row as EchoRow;
  const moderationText = [echoRow.title, echoRow.prompt, echoRow.response]
    .filter(Boolean)
    .join("\n\n");
  const verdict = await moderateContent(moderationText);
  const { error: gateErr } = await supabase
    .from("public_echoes")
    .update({ check_content: verdict.ok })
    .eq("id", echoId);
  if (gateErr) {
    // If we can't persist the gate, log and continue — a later re-run can fix it.
    console.warn("[embed-echo] failed to set check_content:", gateErr.message);
  }
  if (!verdict.ok) {
    console.warn(`[embed-echo] echo ${echoId} flagged:`, verdict.categories.join(", "));
    // Flagged content stays hidden (check_content=false). No point embedding it.
    return new Response(
      JSON.stringify({ ok: false, reason: "flagged", categories: verdict.categories }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const text = buildEmbeddingText(echoRow);
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
