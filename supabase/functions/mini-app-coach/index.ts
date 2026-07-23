// mini-app-coach — data-grounded coaching for the mini-apps.
//
// Reads the signed-in user's *structured* stats (the habit/fitness/expense/task
// RPCs added in Phase 1, all under RLS) and asks the model for a short, concrete
// next step grounded in those real numbers — not generic advice. Powers the
// "Ask Echo about {app}" bar. All keys come from Deno env at request time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const ECHO_AI_MODEL = Deno.env.get("ECHO_AI_MODEL") ?? "google/gemini-2.5-flash";
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

type App = "habits" | "fitness" | "expenses" | "tasks";
const RPC: Record<App, string> = {
  habits: "habit_stats",
  fitness: "fitness_stats",
  expenses: "expense_stats",
  tasks: "task_stats",
};

// A compact, human-readable summary of the raw stats + a tailored instruction.
function frame(app: App, stats: unknown): { summary: string; ask: string } {
  const rows = Array.isArray(stats) ? stats : stats ? [stats] : [];
  switch (app) {
    case "habits": {
      const total = rows.length;
      const active = rows.filter((r: Record<string, unknown>) => Number(r.current_streak) > 0).length;
      const best = rows.reduce((m: number, r: Record<string, unknown>) => Math.max(m, Number(r.current_streak) || 0), 0);
      const avg30 = total
        ? Math.round(rows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.completion_30d) || 0), 0) / total)
        : 0;
      return {
        summary: `Habits tracked: ${total}. Currently on a streak: ${active}. Longest active streak: ${best} days. Avg completions in last 30 days per habit: ${avg30}.`,
        ask: "Give one specific, encouraging next step to keep or rebuild momentum this week.",
      };
    }
    case "fitness": {
      const r = (rows[0] ?? {}) as Record<string, unknown>;
      return {
        summary: `Today: ${Math.round(Number(r.calories_today) || 0)} kcal, ${Math.round(Number(r.protein_today) || 0)}g protein, ${Math.round(Number(r.water_today_ml) || 0)}ml water. This week: ${Number(r.workouts_week) || 0} workouts. Latest weight: ${r.latest_weight_kg ?? "n/a"} kg. Logging streak: ${Number(r.log_streak) || 0} days.`,
        ask: "Give one realistic adjustment for the rest of this week based on these numbers.",
      };
    }
    case "expenses": {
      const r = (rows[0] ?? {}) as Record<string, unknown>;
      const cur = (r.currency as string) || "";
      return {
        summary: `This month: income ${cur}${Math.round(Number(r.income_month) || 0)}, spend ${cur}${Math.round(Number(r.expense_month) || 0)}, net ${cur}${Math.round(Number(r.net_month) || 0)} across ${Number(r.tx_count) || 0} transactions. Budget: ${r.budget != null ? cur + Math.round(Number(r.budget)) : "not set"}.`,
        ask: "Give one concrete money move for the rest of this month based on these numbers.",
      };
    }
    case "tasks": {
      const r = (rows[0] ?? {}) as Record<string, unknown>;
      return {
        summary: `Open: ${Number(r.open_count) || 0} (${Number(r.high_open) || 0} high-priority). Due today: ${Number(r.due_today) || 0}. Overdue: ${Number(r.overdue) || 0}. Completed: ${Number(r.done_count) || 0}.`,
        ask: "Suggest the single best thing to do next and why, in one or two sentences.",
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!OPENROUTER_API_KEY) return json({ error: "AI is not configured" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  let app: App;
  try {
    const body = await req.json();
    app = body.app;
    if (!RPC[app]) return json({ error: "Unknown app" }, 400);
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  // Per-user client → the RPC runs as the authenticated user (RLS-scoped).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

  const { data: stats, error: rpcErr } = await supabase.rpc(RPC[app]);
  if (rpcErr) return json({ error: "Could not read your data" }, 500);

  const { summary, ask } = frame(app, stats);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
        "X-Title": "Echo Mini-App Coach",
      },
      body: JSON.stringify({
        model: ECHO_AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are Echo, a warm, concise coach inside a productivity app. Ground every point in the user's real numbers. Be specific and encouraging, never generic or preachy. Reply in 2–4 short sentences, no markdown headers, no bullet lists unless truly needed.",
          },
          { role: "user", content: `Here are my ${app} stats:\n${summary}\n\n${ask}` },
        ],
        stream: false,
      }),
    });
    if (!res.ok) return json({ error: "AI unavailable", detail: await res.text() }, 502);
    const out = await res.json();
    const coaching: string = out.choices?.[0]?.message?.content?.trim() ?? "";
    if (!coaching) return json({ error: "Empty response" }, 502);
    return json({ app, coaching, summary });
  } catch (e) {
    return json({ error: "AI request failed", detail: String(e) }, 502);
  }
});
