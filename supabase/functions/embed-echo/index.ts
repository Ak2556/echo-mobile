// embed-echo — moderate a published echo, then generate a 768-d embedding and
// thoughtfulness score, and persist all of it on public_echoes.
//
// Since 20260928110000 the server path is the job worker: moderate_new_echo
// enqueues a 'moderation' job and the worker calls judgeEcho directly, with
// queue retries and a dead-letter queue. This endpoint remains for the author's
// app (lib/supabaseEchoApi.ts -> triggerEmbedEcho) and for a database still on
// the old trigger during rollout. The judging itself lives in judge.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isServiceCaller } from "./serviceCaller.ts";
import { judgeEcho, type JudgeResult } from "./judge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

/** The HTTP contract the app has always seen, one status per outcome. */
function toResponse(r: JudgeResult): Response {
  switch (r.kind) {
    case "not_found": return json({ error: r.error }, 404);
    case "unavailable": return json({ ok: false, reason: "moderation_unavailable" }, 503);
    case "verdict_not_saved": return json({ error: r.error }, 500);
    case "superseded": return json({ ok: false, reason: "superseded" }, 200);
    case "flagged": return json({ ok: false, reason: "flagged", categories: r.categories }, 200);
    case "empty": return json({ ok: false, reason: "empty text" }, 200);
    case "embed_failed": return json({ error: r.error }, 502);
    case "embedding_not_saved": return json({ error: r.error }, 500);
    case "embedded": return json({ ok: true, dim: r.dim, thoughtfulness: r.thoughtfulness }, 200);
  }
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
    return json({ error: (err as Error).message }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "authorization required" }, 401);

  // Two callers: the author's app (user JWT, must own the post, rate-limited),
  // and the database, which sends the shared x-embed-echo-secret (see
  // serviceCaller.ts).
  const fromService = await isServiceCaller(req.headers.get("x-embed-echo-secret"));
  if (!fromService) {
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData.user) return json({ error: "invalid authorization" }, 401);
    const callerId = authData.user.id;

    const { data: owner, error: ownerErr } = await supabase
      .from("public_echoes")
      .select("author_id")
      .eq("id", echoId)
      .single();
    if (ownerErr || !owner) return json({ error: ownerErr?.message ?? "echo not found" }, 404);
    if ((owner as { author_id: string }).author_id !== callerId) return json({ error: "forbidden" }, 403);

    const { error: embedLimitError } = await supabase.rpc("check_app_rate_limit", {
      p_action: "embed_echo_hour",
      p_limit: 40,
      p_window_seconds: 3600,
      p_user_id: callerId,
    });
    if (embedLimitError) return json({ error: "Rate limit reached. Try again later." }, 429);
  }

  return toResponse(await judgeEcho(supabase, echoId, { inlineRetries: 2 }));
});
