// One chat-completions call, Gemini first, OpenRouter as the fallback.
//
// Every Gemini model Echo uses was reached through OpenRouter, pinned to the
// google-ai-studio provider. That made OpenRouter's *account* limit (about 20
// requests a day on a credit-less account) the ceiling for chat and moderation
// across all users, whatever Google's own quota was. voice-command already
// calls Google directly; this does the same for OpenAI-shaped callers.
//
// Google's OpenAI-compatible endpoint takes the same body — messages, tools,
// tool_choice, response_format — so callers keep their message format. Model
// ids drop OpenRouter's "google/" prefix. Google's quota is per project, so
// every function using GEMINI_API_KEY draws from one bucket.

import { guardedFetch } from "./breaker.ts";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessageOut {
  content: string;
  tool_calls?: ChatToolCall[];
}

/**
 * The longest one provider attempt may take. Gemini normally answers in a few seconds; without a
 * limit a stalled connection holds the request open until the platform's own ceiling, and an agent
 * turn can chain several model calls. Each attempt gets its own budget, so a Gemini timeout falls
 * through to OpenRouter instead of failing the turn.
 */
export const PROVIDER_TIMEOUT_MS = 25_000;

export interface ChatRequest {
  /** OpenRouter-style id, e.g. "google/gemini-2.5-flash". */
  model: string;
  messages: unknown[];
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  /** The caller's own abort (a client that went away). Rethrown, never retried on the other provider. */
  signal?: AbortSignal;
  /** Per-attempt limit; defaults to PROVIDER_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Sent to OpenRouter as X-Title. */
  title: string;
}

function attemptSignal(req: ChatRequest): AbortSignal {
  const limit = AbortSignal.timeout(req.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  return req.signal ? AbortSignal.any([req.signal, limit]) : limit;
}

function describeFailure(provider: string, e: unknown, req: ChatRequest): string {
  if (e instanceof Error && e.name === "TimeoutError") {
    return `${provider}: no answer within ${(req.timeoutMs ?? PROVIDER_TIMEOUT_MS) / 1000}s`;
  }
  return `${provider}: ${e instanceof Error ? e.message : String(e)}`;
}

export function hasChatProvider(): boolean {
  return Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENROUTER_API_KEY"));
}

export function geminiModelId(model: string): string {
  return model.replace(/^google\//, "");
}

export async function chatCompletion(req: ChatRequest): Promise<ChatMessageOut> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (!geminiKey && !openRouterKey) throw new Error("No AI provider configured (GEMINI_API_KEY / OPENROUTER_API_KEY)");

  const common = {
    messages: req.messages,
    tools: req.tools?.length ? req.tools : undefined,
    tool_choice: req.tools?.length ? "auto" : undefined,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    response_format: req.response_format,
    stream: false,
  };

  let geminiError: string | null = null;
  if (geminiKey) {
    try {
      const res = await guardedFetch("gemini", GEMINI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...common, model: geminiModelId(req.model) }),
        signal: attemptSignal(req),
      });
      if (res.ok) return readMessage(await res.json(), "Gemini");
      geminiError = `Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`;
    } catch (e) {
      if (req.signal?.aborted) throw e;
      geminiError = describeFailure("Gemini", e, req);
    }
    if (!openRouterKey) throw new Error(geminiError);
    console.warn(`[aiChat] ${req.title}: falling back to OpenRouter after ${geminiError}`);
  }

  let res: Response;
  try {
    res = await guardedFetch("openrouter", OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": req.title,
      },
      body: JSON.stringify({ ...common, model: req.model, provider: { only: ["google-ai-studio"] } }),
      signal: attemptSignal(req),
    });
  } catch (e) {
    if (req.signal?.aborted) throw e;
    const detail = describeFailure("OpenRouter", e, req);
    throw new Error(geminiError ? `${geminiError}; ${detail}` : detail);
  }
  if (!res.ok) {
    const detail = `OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`;
    throw new Error(geminiError ? `${geminiError}; ${detail}` : detail);
  }
  return readMessage(await res.json(), "OpenRouter");
}

// deno-lint-ignore no-explicit-any
export function readMessage(json: any, provider: string): ChatMessageOut {
  const message = json?.choices?.[0]?.message;
  if (!message) throw new Error(`${provider} returned no message`);
  // The confirm-card flow keys pending tool calls by id, and Google's
  // compatibility layer has been seen returning calls without one.
  const tool_calls: ChatToolCall[] | undefined = Array.isArray(message.tool_calls) && message.tool_calls.length
    ? message.tool_calls.map((c: ChatToolCall) => ({ ...c, id: c.id || `call_${crypto.randomUUID()}` }))
    : undefined;
  return { content: message.content ?? "", tool_calls };
}
