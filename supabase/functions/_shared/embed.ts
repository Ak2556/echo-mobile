// Text embeddings: Gemini direct first, OpenRouter as the fallback.
//
// Every embedding Echo stores (posts, daily answers, interests) is
// gemini-embedding-001 cut to 768 dimensions, for vector(768) columns searched
// with cosine distance (<=>). Until 2026-11-19 all of them went through
// OpenRouter, which proxies the same Google model; this asks Google directly,
// so embeddings no longer depend on OpenRouter credit.
//
// Same model, same truncation, so the vectors agree with the ones already
// stored. ops-probe embeds one sentence both ways on every run and alerts if
// they stop agreeing, which is the only thing that would break search: a new
// vector that no longer lines up with the old ones. Vector length does not
// matter, because every query uses cosine.

import { guardedFetch } from "./breaker.ts";

export const EMBEDDING_DIM = 768;
const DEFAULT_MODEL = "google/gemini-embedding-001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/embeddings";

/** OpenRouter-style id; Gemini direct drops the "google/" prefix. */
export function embeddingModel(): string {
  return Deno.env.get("EMBEDDING_MODEL") || DEFAULT_MODEL;
}

export interface EmbedOptions {
  /** OpenRouter-style id. Defaults to EMBEDDING_MODEL, then gemini-embedding-001. */
  model?: string;
  /** Output dimensions; null for the model's full length. Defaults to 768. */
  dims?: number | null;
  /** Sent to OpenRouter as X-Title. */
  title?: string;
}

function check(values: unknown, dims: number | null, provider: string): number[] {
  if (!Array.isArray(values) || values.length === 0 || (dims !== null && values.length !== dims)) {
    throw new Error(`${provider} returned an unexpected embedding (len=${Array.isArray(values) ? values.length : "n/a"})`);
  }
  return values as number[];
}

export async function embedViaGemini(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const key = Deno.env.get("GEMINI_API_KEY") ?? "";
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = (opts.model ?? embeddingModel()).replace(/^google\//, "");
  const dims = opts.dims === undefined ? EMBEDDING_DIM : opts.dims;
  const res = await guardedFetch(
    "gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
    {
      method: "POST",
      // Key in a header, never the URL: fetch errors quote the URL into logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        ...(dims === null ? {} : { outputDimensionality: dims }),
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embedding ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return check(json?.embedding?.values, dims, "Gemini");
}

export async function embedViaOpenRouter(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const key = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  const dims = opts.dims === undefined ? EMBEDDING_DIM : opts.dims;
  const res = await guardedFetch("openrouter", OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": opts.title ?? "Echo Embeddings",
    },
    body: JSON.stringify({
      model: opts.model ?? embeddingModel(),
      input: text,
      ...(dims === null ? {} : { dimensions: dims }),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter embedding ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return check(json?.data?.[0]?.embedding, dims, "OpenRouter");
}

/** One embedding: Gemini direct, then OpenRouter. Throws with both causes when neither answers. */
export async function embedText(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const hasGemini = Boolean(Deno.env.get("GEMINI_API_KEY"));
  const hasOpenRouter = Boolean(Deno.env.get("OPENROUTER_API_KEY"));
  if (!hasGemini && !hasOpenRouter) throw new Error("No embedding provider configured (GEMINI_API_KEY / OPENROUTER_API_KEY)");
  let geminiError = "";
  if (hasGemini) {
    try {
      return await embedViaGemini(text, opts);
    } catch (e) {
      geminiError = e instanceof Error ? e.message : String(e);
      if (!hasOpenRouter) throw e;
      console.warn(`[embed] ${opts.title ?? "embedding"}: falling back to OpenRouter after ${geminiError}`);
    }
  }
  try {
    return await embedViaOpenRouter(text, opts);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(geminiError ? `${geminiError}; ${detail}` : detail);
  }
}

export function hasEmbeddingProvider(): boolean {
  return Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"));
}

/** Cosine similarity of two equal-length vectors; 1 means the same direction. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return NaN;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
