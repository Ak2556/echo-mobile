// i18n-translate — runtime UI localization.
//
// The app translates its own interface into any of the ~25 supported languages
// on demand: when a string has no hand-authored translation for the chosen
// language, the client batches the misses and asks here. We translate via Gemini
// (OpenRouter, same key as echo-ai) and the client caches the result (MMKV) so a
// given string is only ever translated once per language.
//
// Contract:
//   POST { language: "hi", languageName: "Hindi", items: { "key": "English text" } }
//   200  { translations: { "key": "अनुवाद" } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const MODEL = Deno.env.get("I18N_TRANSLATE_MODEL") ?? Deno.env.get("ECHO_AI_MODEL") ?? "google/gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Optional shared secret for the offline build-time generator (generate-i18n.mjs).
// When set and matched via the x-gen-secret header, the batch generator can call
// this without a user session. App calls still go through normal user auth.
const GEN_SECRET = Deno.env.get("I18N_GEN_SECRET") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const MAX_ITEMS = 200;

function buildPrompt(languageName: string, language: string): string {
  return `You are a professional mobile-app localizer. Translate each UI string from English into ${languageName} (BCP-47 "${language}").

Rules:
- Keep placeholder tokens like {name}, {count}, {value} EXACTLY as written — do not translate or reorder their braces.
- Keep translations short, natural and idiomatic for a phone UI — match the brevity of the English.
- Do NOT translate the brand name "Echo".
- Preserve trailing punctuation and ellipsis (…).
- You MUST include EVERY key from the input and translate its value — never skip, drop, or leave a value in English (except the word "Echo" and any {placeholders}).
- Return ONLY a JSON object mapping each input key to its translated string. No commentary, no markdown.`;
}

function safeParse(raw: string): Record<string, string> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!obj || typeof obj !== "object") return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!OPENROUTER_API_KEY) return json({ error: "Translation is not configured" }, 503);

  // Build-time generator path: a matching x-gen-secret bypasses user auth so the
  // offline script can populate all languages without a session. App calls still
  // go through normal user auth below.
  const genSecret = req.headers.get("x-gen-secret") ?? "";
  const isGenerator = GEN_SECRET.length > 0 && genSecret === GEN_SECRET;

  if (!isGenerator) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
  }

  let language = "";
  let languageName = "";
  let items: Record<string, string> = {};
  try {
    const body = await req.json();
    language = typeof body.language === "string" ? body.language : "";
    languageName = typeof body.languageName === "string" ? body.languageName : language;
    if (body.items && typeof body.items === "object") items = body.items;
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const keys = Object.keys(items);
  if (!language || keys.length === 0) return json({ error: "Nothing to translate" }, 400);
  if (keys.length > MAX_ITEMS) return json({ error: "Too many items" }, 413);
  if (language === "en") return json({ translations: items });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo i18n",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildPrompt(languageName, language) },
          { role: "user", content: JSON.stringify(items) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        stream: false,
      }),
    });
    if (!res.ok) return json({ error: "Translator unavailable", detail: await res.text() }, 502);
    const out = await res.json();
    const content: string = out.choices?.[0]?.message?.content ?? "";
    const translations = safeParse(content);
    if (!translations) return json({ error: "Empty translation" }, 502);
    // Only return keys we were asked for (guard against the model inventing keys).
    const filtered: Record<string, string> = {};
    for (const k of keys) if (typeof translations[k] === "string") filtered[k] = translations[k];
    return json({ translations: filtered });
  } catch (e) {
    return json({ error: "Translation failed", detail: String(e) }, 502);
  }
});
