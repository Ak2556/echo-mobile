// voice-command — hands-free control for Echo.
//
// Takes a short voice clip (the user speaking, typically Hindi or English),
// sends it to a multimodal model (Gemini via OpenRouter — the same key/route as
// echo-ai), and returns BOTH the transcript and a structured intent the app can
// act on, plus a short spoken-style reply in the user's own language.
//
// One round trip does speech-to-text + intent parsing, so the mobile client only
// needs to record audio (expo-audio, already shipped) — no new native module and
// no dev-client rebuild. All keys stay server-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
// Prefer a fast multimodal model. gemini-2.5-flash handles Hindi audio well.
const VOICE_MODEL = Deno.env.get("VOICE_COMMAND_MODEL") ?? Deno.env.get("ECHO_AI_MODEL") ?? "google/gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// The closed set of things a voice command can do. Keep in sync with the client
// dispatcher (lib/voice/intents.ts). The model MUST pick one of these.
const INTENTS = [
  "navigate",          // args.destination: home|explore|market|chat|you|alerts|settings|create|profile
  "create_post",       // args.text: the echo to publish
  "open_daily_question",
  "search",            // args.query
  "open_ai_chat",      // args.prompt (optional): start Echo AI, optionally with a question
  "set_language",      // args.language: a language name or code the user asked for
  "go_back",
  "read_feed",         // read what's on screen aloud (client may defer until TTS ships)
  "help",              // user asked what they can say
  "unknown",           // couldn't confidently map — reply asks them to rephrase
] as const;

const SYSTEM_PROMPT = `You are the voice controller for "Echo", a social + AI thinking app. The user speaks a short command, usually in Hindi (Devanagari or Romanized), sometimes English or mixed. Do THREE things:
1. Transcribe exactly what they said (keep their language/script).
2. Detect their language as a BCP-47 code (e.g. "hi", "en").
3. Map the command to ONE intent from this list: ${INTENTS.join(", ")}.

Intent rules:
- "navigate": going to a section. args.destination ∈ [home, explore, market, chat, you, alerts, settings, create, profile]. Examples: "होम पर जाओ"→home, "मैसेज खोलो"→chat, "प्रोफाइल दिखाओ"→you, "सेटिंग"→settings.
- "create_post": they want to post/share a thought. Put the DICTATED CONTENT (not the command words) in args.text. Example: "ये पोस्ट करो: आज मौसम अच्छा है" → args.text="आज मौसम अच्छा है".
- "open_daily_question": answering/opening today's question. Example: "आज का सवाल".
- "search": args.query = what to find. Example: "खाना ढूंढो" → args.query="खाना".
- "open_ai_chat": talk to Echo AI. args.prompt = their question if any.
- "set_language": switch app language. args.language = the language they named (e.g. "hindi", "english").
- "go_back": back/previous.
- "read_feed": read the screen / feed aloud.
- "help": "मैं क्या बोल सकता हूँ", "help", "what can I say".
- "unknown": anything you cannot confidently map.

Also write "reply": a SHORT (max ~12 words) friendly confirmation in the SAME language the user spoke — what you're about to do, or (for unknown) a gentle ask to repeat. For Hindi input, reply in natural Hindi.

Respond with ONLY a JSON object, no markdown:
{"transcript": string, "locale": string, "intent": one of the list, "args": object, "reply": string}`;

interface VoiceResult {
  transcript: string;
  locale: string;
  intent: string;
  args: Record<string, unknown>;
  reply: string;
}

function safeParse(raw: string): VoiceResult | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const o = JSON.parse(cleaned.slice(start, end + 1));
    const intent = typeof o.intent === "string" && (INTENTS as readonly string[]).includes(o.intent) ? o.intent : "unknown";
    return {
      transcript: typeof o.transcript === "string" ? o.transcript : "",
      locale: typeof o.locale === "string" ? o.locale : "",
      intent,
      args: o.args && typeof o.args === "object" ? o.args : {},
      reply: typeof o.reply === "string" ? o.reply : "",
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!OPENROUTER_API_KEY) return json({ error: "Voice is not configured" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  // Validate the caller is a real signed-in user — this endpoint spends AI
  // credits per call, so anon-key-only requests must be rejected.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  let audioB64 = "";
  let format = "wav";
  let hintLocale = "";
  try {
    const body = await req.json();
    audioB64 = typeof body.audio === "string" ? body.audio : "";
    if (typeof body.format === "string") format = body.format;
    if (typeof body.locale === "string") hintLocale = body.locale;
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!audioB64) return json({ error: "No audio" }, 400);
  // Guard against oversized clips (base64 ~1.37x). ~4MB base64 ≈ ~3MB audio ≈ plenty for a command.
  if (audioB64.length > 4_500_000) return json({ error: "Clip too long" }, 413);

  const userText = hintLocale
    ? `The user's app language is "${hintLocale}". Here is the voice command:`
    : "Here is the voice command:";

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Voice",
      },
      body: JSON.stringify({
        model: VOICE_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "input_audio", input_audio: { data: audioB64, format } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        stream: false,
      }),
    });
    if (!res.ok) return json({ error: "Voice model unavailable", detail: await res.text() }, 502);
    const out = await res.json();
    const content: string = out.choices?.[0]?.message?.content ?? "";
    const parsed = safeParse(content);
    if (!parsed) {
      return json({ transcript: "", locale: hintLocale, intent: "unknown", args: {}, reply: "" }, 200);
    }
    return json(parsed);
  } catch (e) {
    return json({ error: "Voice request failed", detail: String(e) }, 502);
  }
});
