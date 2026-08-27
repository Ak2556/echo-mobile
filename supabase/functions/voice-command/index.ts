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
// Prefer a fast multimodal model. gemini-2.5-flash-lite handles Hindi audio well.
const VOICE_MODEL = Deno.env.get("VOICE_COMMAND_MODEL") ?? Deno.env.get("ECHO_AI_MODEL") ?? "google/gemini-2.5-flash-lite";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Optional: call Google AI Studio (Gemini) directly. Its free tier accepts audio
// input, so voice works without an OpenRouter balance. When set, this is preferred.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_VOICE_MODEL") ?? "gemini-2.5-flash-lite";
const AUDIO_MIME: Record<string, string> = {
  wav: "audio/wav", mp3: "audio/mp3", m4a: "audio/mp4", aac: "audio/aac",
  caf: "audio/x-caf", ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
};

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
  "navigate",           // args.destination: a section/screen name
  "open_mini_app",      // args.app: a tool name (pomodoro, habits, notes, tasks, money, fitness…)
  "create_post",        // args.text: the echo to publish
  "open_daily_question",
  "search",             // args.query
  "open_ai_chat",       // args.prompt (optional)
  "set_feed",           // args.scope: for you | trending | following | latest
  "set_language",       // args.language
  "set_theme",          // args.theme: dark | light
  "toggle_setting",     // args.setting + args.value: turn a setting on/off
  "post_action",        // args.action: like | bookmark | repost | follow | open the post in view
  "scroll",             // args.direction: up | down
  "refresh",            // reload the feed
  "read_feed",          // read the current feed aloud
  "read_notifications", // read notifications aloud
  "go_back",
  "help",               // user asked what they can say
  "unknown",            // couldn't confidently map — reply asks them to rephrase
] as const;

const SYSTEM_PROMPT = `You are the voice controller for "Echo", a social + AI thinking app. The user speaks a short command, usually in Hindi (Devanagari or Romanized), sometimes English or mixed. Do THREE things:
1. Transcribe exactly what they said (keep their language/script).
2. Detect their language as a BCP-47 code (e.g. "hi", "en").
3. Map the command to ONE intent from this list: ${INTENTS.join(", ")}.

Intent rules:
- "navigate": going to a section/screen. args.destination is one of: home, explore, market, chat, messages, you (profile), notifications (alerts), settings, create (compose a post), story, bookmarks (saved), followers, tools (apps), verify, badges, quests, salons, upgrade. Examples: "होम पर जाओ"→home, "मैसेज खोलो"→messages, "प्रोफाइल दिखाओ"→you, "सेटिंग"→settings, "बुकमार्क"→bookmarks.
- "open_mini_app": open a specific tool/mini-app. args.app MUST be one canonical id: pomodoro (timer/focus/टाइमर), tasks (todo/टास्क/काम), notes (नोट), habits (आदत), expenses (money/budget/पैसा/खर्च/बजट/khata/खाता), fitness (workout/gym/कसरत/व्यायाम), shopping-list (shopping/खरीदारी/सामान), calculator (calc/हिसाब/गणना), learn (study/course/सीखो/पढ़ाई), planner (schedule/योजना), voice-memo (memo/record/रिकॉर्ड/आवाज़ नोट), camera (photo/कैमरा/फोटो), image-editor (photo editor/फोटो एडिटर), world-clock (clock/timezone/घड़ी/समय क्षेत्र), markdown (write/लिखो/लेखन), password-gen (password/पासवर्ड). Optionally set args.action (+ args.value) to ENTER DATA inside the app — pomodoro: action=start|stop; tasks/notes/habits/shopping-list/planner: action=add, value=the item text (keep the user's language); expenses: action=add, value MUST be a JSON string of format '{"amount": number, "category": string, "type": "income"|"expense"|"sale"|"purchase"|"receipt"|"payment", "partyName": "person name or empty", "note": "brief reason or empty"}', e.g. "राहुल ने खाने के लिए 500 दिए" -> app=expenses, action=add, value='{"amount":500, "category":"Food", "type":"receipt", "partyName":"Rahul", "note":"Food"}'; fitness: action=add, value="weight 70" to log weight or "water" to log a glass of water. Examples: "पोमोडोरो खोलो"→app=pomodoro, "टाइमर चालू करो"→app=pomodoro,action=start, "टाइमर बंद करो"→app=pomodoro,action=stop, "टास्क जोड़ो दूध लाना"→app=tasks,action=add,value="दूध लाना", "add task call mom"→app=tasks,action=add,value="call mom", "नोट लिखो idea"→app=notes,action=add,value="idea", "आदत जोड़ो पानी पीना"→app=habits,action=add,value="पानी पीना".
- "create_post": they want to post/share a thought. Put the DICTATED CONTENT (not the command words) in args.text. Example: "ये पोस्ट करो: आज मौसम अच्छा है" → args.text="आज मौसम अच्छा है".
- "open_daily_question": answering/opening today's question. Example: "आज का सवाल".
- "search": args.query = what to find. Example: "खाना ढूंढो" → args.query="खाना".
- "open_ai_chat": talk to Echo AI. args.prompt = their question if any.
- "set_feed": switch the home feed tab. args.scope ∈ [for you, trending, following, latest]. Example: "ट्रेंडिंग दिखाओ"→scope=trending, "फॉलोइंग फीड"→scope=following.
- "set_language": switch app language. args.language = the language they named (e.g. "hindi", "english").
- "set_theme": switch appearance/theme. args.theme ∈ [dark, light]. ALWAYS use this for light/dark mode, even when phrased as "on/off" — never toggle_setting. Examples: "डार्क मोड"→theme=dark, "लाइट मोड ऑन करो"→theme=light, "turn on light mode"→theme=light, "dark mode off"→theme=light.
- "toggle_setting": turn a setting on/off. args.setting = the setting name (notifications, haptics, sound, read receipts, private account, compact feed, data saver, autoplay stories, auto read replies, auto read messages, etc.); args.value = "on" or "off" if stated. Examples: "नोटिफिकेशन बंद करो"→setting=notifications,value=off, "haptics on"→setting=haptics,value=on.
- "post_action": act on the post currently on screen. args.action ∈ [like, bookmark, repost, follow, open]. Examples: "इसे लाइक करो"→action=like, "save this"→action=bookmark, "repost this"→action=repost, "इन्हें फॉलो करो"→action=follow, "open this"→action=open.
- "scroll": args.direction ∈ [up, down]. Examples: "नीचे स्क्रॉल करो"→down, "ऊपर जाओ"→up.
- "refresh": reload the feed ("रिफ्रेश करो", "refresh").
- "read_feed": read the current feed aloud ("फीड पढ़ो", "read the feed to me").
- "read_notifications": read notifications aloud ("नोटिफिकेशन पढ़ो", "read my notifications").
- "go_back": back/previous.
- "help": "मैं क्या बोल सकता हूँ", "help", "what can I say".
- "unknown": anything you cannot confidently map.

CRITICAL: the command works in Hindi (Devanagari or Romanized), English, or mixed. Understand any of them. But the ARG VALUES that are drawn from the fixed lists above — destination, app, action, scope, theme, setting, direction, and the on/off value — MUST be the ENGLISH canonical keyword from those lists, even when the user speaks Hindi (e.g. "होम पर जाओ" → destination="home", "डार्क मोड" → theme="dark", "नोटिफिकेशन बंद करो" → setting="notifications", value="off"). Only FREE TEXT stays in the user's own language: create_post text, search query, and the item value for add-to-app commands (tasks/notes/habits/shopping-list/planner). For expenses the value MUST be the EXACT JSON string schema requested; for fitness it is "weight <number>" or "water".

DISAMBIGUATION — apply these to avoid the common mistakes:
- "open/खोलो/दिखाओ + a tool" (pomodoro, tasks, notes, habits, money/expenses, fitness, shopping, calculator, learn, planner, world clock, camera, passwords…) → open_mini_app, NOT navigate. Only home/explore/market/chat/messages/profile/notifications/settings/bookmarks/tools are navigate destinations.
- "add/जोड़ो/लिखो/log + content" → open_mini_app, action=add, content in value; pick the app from context (task→tasks, note→notes, habit→habits, item/grocery/सामान→shopping-list, plan→planner, spend/खर्च + amount→expenses, weight/वज़न or water/पानी→fitness).
- appearance (light/dark mode, theme) → set_theme; a boolean feature (notifications, haptics, sound, private, etc.) → toggle_setting.
- "read/पढ़ो feed" → read_feed; "read/पढ़ो notifications" → read_notifications.
- If the audio is empty/silent or you truly cannot tell, return intent="unknown" with a gentle ask — do NOT guess a random action, and never invent an intent outside the list.

Also write "reply": a SHORT (max ~12 words) confirmation in the SAME language the user spoke — but make it sound like a warm, real human assistant, not a robot. Be natural and friendly, and SOMETIMES (not every time, never forced or cheesy) add a light, tasteful touch of wit or personality. Match the user's vibe. For Hindi input, reply in natural, colloquial Hindi (bol-chaal ki bhasha, not stiff textbook Hindi). Tone examples: "Done — timer's ticking ⏱️", "You got it, opening Notes", "Task's in. Future-you says thanks 😄", "टास्क जुड़ गया, अब भूलना मत!", "लाइट मोड ऑन — आंखों को थोड़ा आराम". For unknown/unclear, a good-natured nudge to try again, e.g. "Hmm, that one flew past me — say it once more?" / "अरे, ठीक से सुनाई नहीं दिया — फिर से बोलो?". Keep it brief, human, and never robotic. (Emojis are fine; they're dropped when spoken aloud.)

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
  if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) return json({ error: "Voice is not configured" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  // Validate the caller is a real signed-in user — this endpoint spends AI
  // credits per call, so anon-key-only requests must be rejected.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  // Verifying the caller and reading the body are independent, and the auth
  // check is a network round trip to Supabase. Running them one after the other
  // put that round trip directly on the path between the phone finishing its
  // upload and the model starting work. Both still have to succeed — they just
  // no longer queue behind each other.
  let audioB64 = "";
  let spokenText = "";
  let format = "wav";
  let hintLocale = "";

  const [authResult, bodyResult] = await Promise.all([
    supabase.auth.getUser(),
    req.json().then(
      (b: Record<string, unknown>) => ({ ok: true as const, b }),
      () => ({ ok: false as const, b: null }),
    ),
  ]);

  const { data: userData, error: userErr } = authResult;
  if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  if (!bodyResult.ok || !bodyResult.b) return json({ error: "Bad request" }, 400);
  {
    const body = bodyResult.b;
    audioB64 = typeof body.audio === "string" ? body.audio : "";
    if (typeof body.text === "string") spokenText = body.text.trim();
    if (typeof body.format === "string") format = body.format;
    if (typeof body.locale === "string") hintLocale = body.locale;
  }

  // Two shapes now. The client recognises speech on the device and sends the
  // transcript, which skips both the upload and the model's transcription work;
  // audio remains for devices with no recognition service. One or the other.
  if (!audioB64 && !spokenText) return json({ error: "No audio or text" }, 400);
  if (spokenText.length > 2_000) return json({ error: "Command too long" }, 413);
  // Guard against oversized clips (base64 ~1.37x). ~4MB base64 ≈ ~3MB audio ≈ plenty for a command.
  if (audioB64.length > 4_500_000) return json({ error: "Clip too long" }, 413);

  const localeHint = hintLocale ? `The user's app language is "${hintLocale}". ` : "";
  const userText = spokenText
    ? `${localeHint}The user said: "${spokenText}"`
    : `${localeHint}Here is the voice command:`;

  try {
    let content = "";
    if (GEMINI_API_KEY) {
      // Google AI Studio (Gemini) direct — free tier, no OpenRouter balance needed.
      const mime = AUDIO_MIME[format] ?? "audio/mp4";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const geminiBody = JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: spokenText
            ? [{ text: userText }]
            : [{ text: userText }, { inlineData: { mimeType: mime, data: audioB64 } }],
        }],
        // Low temp = steadier, more deterministic intent detection.
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      });
      // Retry transient rate-limit / server errors (common on the free tier) with backoff.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: geminiBody });
        if (res.ok || !(res.status === 429 || res.status >= 500)) break;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      if (!res || !res.ok) return json({ error: "Voice model unavailable", detail: res ? await res.text() : "no response" }, 502);
      const out = await res.json();
      content = out.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    } else {
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
              // A transcript needs no recording attached. Sending the audio part
              // anyway would ship an empty payload on the text path.
              content: spokenText
                ? userText
                : [
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
      content = out.choices?.[0]?.message?.content ?? "";
    }
    const parsed = safeParse(content);
    if (!parsed) {
      return json({ transcript: "", locale: hintLocale, intent: "unknown", args: {}, reply: "" }, 200);
    }
    return json(parsed);
  } catch (e) {
    return json({ error: "Voice request failed", detail: String(e) }, 502);
  }
});
