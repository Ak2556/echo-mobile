// The model calls behind voice-command, kept out of the request handler so they
// can be tested.
//
// Two inputs reach a model here:
//   a transcript  The phone recognised the speech itself (the usual case). That
//                 is plain text, so it goes through _shared/aiChat like every
//                 other chat call: Gemini direct, stand-in models when Google
//                 has retired one, OpenRouter last.
//   a recording   Phones with no recognition service upload audio. Gemini's
//                 OpenAI-compatible endpoint does not take the formats phones
//                 record (m4a, caf), so audio uses Gemini's native endpoint,
//                 with the same stand-ins, then OpenRouter.
//
// Before 2026-11-19 OpenRouter ran only when GEMINI_API_KEY was missing, so in
// production it was never a fallback: one Gemini failure was a failed command.

import { chatCompletion, standInModels } from "../_shared/aiChat.ts";
import { guardedFetch } from "../_shared/breaker.ts";

/** An intent object is about a hundred tokens; the rest is room for models that reason first. */
export const VOICE_MAX_TOKENS = 1024;

export interface AudioClip {
  base64: string;
  mime: string;
  /** The short format name OpenRouter's input_audio wants: wav, mp3, m4a… */
  format: string;
}

export interface VoiceProviders {
  geminiKey: string;
  /** Native Gemini id for audio, e.g. "gemini-flash-latest". */
  geminiModel: string;
  openRouterKey: string;
  /** OpenRouter-style id, e.g. "google/gemini-2.5-flash-lite". Also the Gemini model for transcripts. */
  openRouterModel: string;
}

export async function interpretTranscript(system: string, userText: string, model: string): Promise<string> {
  const out = await chatCompletion({
    model,
    title: "Echo Voice",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: VOICE_MAX_TOKENS,
  });
  return out.content;
}

/** Free-tier rate limits and brief server errors are common; a short backoff usually clears them. */
async function geminiWithRetry(url: string, init: RequestInit, retryDelayMs: number): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await guardedFetch("gemini", url, init);
    if (res.ok || !(res.status === 429 || res.status >= 500)) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
  }
  return res!;
}

export async function interpretAudio(
  providers: VoiceProviders,
  system: string,
  userText: string,
  clip: AudioClip,
  retryDelayMs = 400,
): Promise<string> {
  const failures: string[] = [];

  if (providers.geminiKey) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }, { inlineData: { mimeType: clip.mime, data: clip.base64 } }] }],
      // Low temperature: steadier, more repeatable intent detection.
      // No maxOutputTokens: Google does not reserve credit for it, and on models
      // that reason first a tight limit can leave no answer.
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    });
    for (const model of [providers.geminiModel, ...standInModels(providers.geminiModel)]) {
      // The key goes in a header, never the query string: Deno's fetch errors
      // quote the full URL, so a key in it leaks into any logged error.
      const res = await geminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": providers.geminiKey }, body },
        retryDelayMs,
      );
      if (res.ok) {
        if (model !== providers.geminiModel) console.warn(`[voice-command] ${providers.geminiModel} is retired; answered by ${model}`);
        const out = await res.json();
        return out.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      }
      failures.push(`Gemini ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`);
      // Only a retired model is worth asking about on another model; quota and
      // outages would fail the same way there.
      if (res.status !== 404) break;
    }
  }

  if (providers.openRouterKey) {
    const res = await guardedFetch("openrouter", "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providers.openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Voice",
      },
      body: JSON.stringify({
        model: providers.openRouterModel,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "input_audio", input_audio: { data: clip.base64, format: clip.format } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        // Without it OpenRouter reserves the model's full output length and a
        // credit-light account refuses the request outright (402).
        max_tokens: VOICE_MAX_TOKENS,
        stream: false,
      }),
    });
    if (res.ok) {
      const out = await res.json();
      return out.choices?.[0]?.message?.content ?? "";
    }
    failures.push(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  throw new Error(failures.join("; ") || "No voice provider configured");
}
