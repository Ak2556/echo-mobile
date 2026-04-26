// Echo AI — OpenRouter tool-use loop with SSE streaming.
// Runs as a Supabase Edge Function. All API keys are read from Deno env at request time;
// the mobile app never sees them.
//
// Endpoint contract: see ./README.md (or scroll to handleRequest).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const ECHO_AI_MODEL = Deno.env.get("ECHO_AI_MODEL") ?? "google/gemini-2.0-flash-exp:free";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── SSE helpers ─────────────────────────────────────────────────────────────

type SSEEvent =
  | { type: "conversation"; id: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_pending"; id: string; name: string; args: unknown; preview: string }
  | { type: "tool_result"; id: string; name: string; ok: boolean; result?: unknown; error?: string }
  | { type: "done" }
  | { type: "error"; message: string };

function sseEncode(event: SSEEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// ─── OpenRouter ──────────────────────────────────────────────────────────────

interface ORToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ORMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ORToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ORTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

async function openRouterChat(
  messages: ORMessage[],
  tools: ORTool[],
): Promise<{ content: string; tool_calls?: ORToolCall[] }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo AI",
    },
    body: JSON.stringify({
      model: ECHO_AI_MODEL,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      stream: false, // we re-stream the final text deltas ourselves; tool loops aren't streamable cleanly
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const choice = json.choices?.[0]?.message;
  if (!choice) throw new Error("OpenRouter returned no message");
  return {
    content: choice.content ?? "",
    tool_calls: choice.tool_calls,
  };
}

// ─── Tool definitions ────────────────────────────────────────────────────────
//
// Tools marked `requiresConfirm: true` are paused and surfaced to the user as
// a confirm card. Read-only tools execute automatically.

interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirm: boolean;
  preview: (args: Record<string, unknown>) => string;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolCtx,
  ) => Promise<unknown>;
}

interface ToolCtx {
  userId: string;
  supabase: SupabaseClient;
}

const TOOLS: ToolSpec[] = [
  {
    name: "compose_post",
    description:
      "Publish a new post (an 'echo') by the current user. Use only when the user clearly wants to publish.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The post's question/topic line." },
        response: { type: "string", description: "The post body." },
        title: { type: "string", description: "Optional short title; auto-derived from prompt if omitted." },
      },
      required: ["prompt", "response"],
    },
    requiresConfirm: true,
    preview: (a) =>
      `Publish post "${(a.title as string | undefined) ?? (a.prompt as string).slice(0, 60)}…"`,
    execute: async (a, { supabase, userId }) => {
      const prompt = a.prompt as string;
      const title =
        ((a.title as string | undefined)?.trim()) ||
        prompt.slice(0, 80) + (prompt.length > 80 ? "…" : "");
      const { data, error } = await supabase
        .from("public_echoes")
        .insert({ author_id: userId, title, prompt, response: a.response })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, title };
    },
  },
  {
    name: "search_feed",
    description: "Search recent posts by text. Returns matching posts with author and id.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", default: 10, maximum: 25 },
      },
      required: ["query"],
    },
    requiresConfirm: false,
    preview: (a) => `Search feed for "${a.query}"`,
    execute: async (a, { supabase }) => {
      const limit = Math.min((a.limit as number | undefined) ?? 10, 25);
      const q = (a.query as string).trim();
      const { data, error } = await supabase
        .from("public_echoes")
        .select("id, author_id, title, prompt, response, likes_count, created_at")
        .or(`title.ilike.%${q}%,prompt.ilike.%${q}%,response.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  },
  {
    name: "summarize_feed",
    description: "Fetch the latest N posts from the user's feed so the assistant can summarize them.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", default: 15, maximum: 30 } },
    },
    requiresConfirm: false,
    preview: () => "Read the latest feed",
    execute: async (a, { supabase }) => {
      const limit = Math.min((a.limit as number | undefined) ?? 15, 30);
      const { data, error } = await supabase
        .from("public_echoes")
        .select("id, author_id, title, prompt, response, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  },
  {
    name: "like_post",
    description: "Like a post by id.",
    parameters: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
    },
    requiresConfirm: true,
    preview: (a) => `Like post ${a.post_id}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("echo_likes")
        .insert({ echo_id: a.post_id, user_id: userId });
      if (error && !error.message.includes("duplicate")) throw error;
      return { ok: true };
    },
  },
  {
    name: "unlike_post",
    description: "Remove like from a post.",
    parameters: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
    },
    requiresConfirm: true,
    preview: (a) => `Unlike post ${a.post_id}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("echo_likes")
        .delete()
        .eq("echo_id", a.post_id)
        .eq("user_id", userId);
      if (error) throw error;
      return { ok: true };
    },
  },
  {
    name: "bookmark_post",
    description: "Save a post to bookmarks (low risk; auto-applies).",
    parameters: {
      type: "object",
      properties: { post_id: { type: "string" } },
      required: ["post_id"],
    },
    requiresConfirm: false,
    preview: (a) => `Bookmark post ${a.post_id}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("echo_bookmarks")
        .insert({ echo_id: a.post_id, user_id: userId });
      if (error && !error.message.includes("duplicate")) throw error;
      return { ok: true };
    },
  },
  {
    name: "comment_on_post",
    description: "Add a comment to a post.",
    parameters: {
      type: "object",
      properties: {
        post_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["post_id", "content"],
    },
    requiresConfirm: true,
    preview: (a) =>
      `Comment on ${a.post_id}: "${(a.content as string).slice(0, 80)}"`,
    execute: async (a, { supabase, userId }) => {
      const { data, error } = await supabase
        .from("echo_comments")
        .insert({ echo_id: a.post_id, author_id: userId, content: a.content })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id };
    },
  },
  {
    name: "find_user",
    description: "Find a user profile by username or display name (substring match).",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    requiresConfirm: false,
    preview: (a) => `Find user "${a.query}"`,
    execute: async (a, { supabase }) => {
      const q = (a.query as string).trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_color, is_verified")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  },
  {
    name: "follow_user",
    description: "Follow a user by their user id.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" } },
      required: ["user_id"],
    },
    requiresConfirm: true,
    preview: (a) => `Follow user ${a.user_id}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: userId, following_id: a.user_id });
      if (error && !error.message.includes("duplicate")) throw error;
      return { ok: true };
    },
  },
  {
    name: "unfollow_user",
    description: "Unfollow a user by their user id.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "string" } },
      required: ["user_id"],
    },
    requiresConfirm: true,
    preview: (a) => `Unfollow user ${a.user_id}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", a.user_id);
      if (error) throw error;
      return { ok: true };
    },
  },
  {
    name: "update_profile",
    description: "Edit the current user's profile fields.",
    parameters: {
      type: "object",
      properties: {
        display_name: { type: "string" },
        bio: { type: "string" },
        avatar_color: { type: "string" },
      },
    },
    requiresConfirm: true,
    preview: (a) => `Update profile (${Object.keys(a).join(", ")})`,
    execute: async (a, { supabase, userId }) => {
      const updates: Record<string, unknown> = {};
      for (const k of ["display_name", "bio", "avatar_color"]) {
        if (a[k] !== undefined) updates[k] = a[k];
      }
      if (Object.keys(updates).length === 0) {
        throw new Error("No fields to update");
      }
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);
      if (error) throw error;
      return { ok: true, updated: Object.keys(updates) };
    },
  },
  {
    name: "list_my_followers",
    description: "List followers of the current user.",
    parameters: { type: "object", properties: {} },
    requiresConfirm: false,
    preview: () => "List my followers",
    execute: async (_a, { supabase, userId }) => {
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId);
      if (error) throw error;
      return data ?? [];
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

const ORTOOL_DEFS: ORTool[] = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Echo, an in-app assistant for a social network called Echo.
Help the user accomplish things in the app — composing posts, searching/summarizing the feed,
following people, liking/commenting, editing their profile.

Rules:
- Use tools whenever the user wants to act on the app. Don't pretend to do things; call the tool.
- Be concise. Don't restate the user's request.
- For destructive or write actions, the system will pause for the user to confirm — don't ask
  for confirmation in chat, the UI handles it.
- If a tool returns an id, refer to it naturally in your reply, not as a raw uuid.
- If you don't have enough info to call a tool (e.g. unknown user_id), use find_user / search_feed
  first to resolve it.
`;

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | null,
): Promise<{ id: string; isNew: boolean }> {
  if (conversationId) {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return { id: data.id, isNew: false };
  }
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, model: ECHO_AI_MODEL })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, isNew: true };
}

async function loadHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 30,
): Promise<ORMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r): ORMessage => ({
    role: r.role,
    content: r.content,
    tool_calls: r.tool_calls ?? undefined,
    tool_call_id: r.tool_call_id ?? undefined,
    name: r.tool_name ?? undefined,
  }));
}

async function persistMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  msg: ORMessage,
): Promise<void> {
  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ?? null,
    tool_call_id: msg.tool_call_id ?? null,
    tool_name: msg.name ?? null,
  });
}

async function logToolCall(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  toolName: string,
  args: unknown,
  status: "executed" | "pending_confirm" | "rejected" | "failed",
  result: unknown = null,
  error: string | null = null,
): Promise<string> {
  const { data, error: dbErr } = await supabase
    .from("ai_tool_calls")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      tool_name: toolName,
      args,
      result,
      status,
      error,
    })
    .select("id")
    .single();
  if (dbErr) throw dbErr;
  return data.id;
}

// ─── Main handler ────────────────────────────────────────────────────────────
//
// POST body shapes:
//   { message: string, conversation_id?: string }
//   { conversation_id: string, confirm: { tool_call_id: string, tool_name: string, args: object, approve: boolean } }

interface RequestBody {
  message?: string;
  conversation_id?: string;
  confirm?: {
    tool_call_id: string;
    tool_name: string;
    args: Record<string, unknown>;
    approve: boolean;
  };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Missing auth", { status: 401, headers: CORS_HEADERS });
  }

  // Per-user Supabase client: every DB call respects RLS as the authenticated user.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return new Response("Invalid auth", { status: 401, headers: CORS_HEADERS });
  }
  const userId = userData.user.id;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SSEEvent) => controller.enqueue(sseEncode(e));

      try {
        const { id: conversationId, isNew } = await getOrCreateConversation(
          supabase,
          userId,
          body.conversation_id ?? null,
        );
        if (isNew) send({ type: "conversation", id: conversationId });

        // ── Confirm branch: user approved/rejected a previously paused tool ──
        if (body.confirm) {
          await runToolAndContinue(
            supabase,
            userId,
            conversationId,
            body.confirm,
            send,
          );
        } else if (body.message) {
          // ── Fresh user turn ──
          const userMsg: ORMessage = { role: "user", content: body.message };
          await persistMessage(supabase, conversationId, userId, userMsg);
          await runAgentLoop(supabase, userId, conversationId, send);
        } else {
          send({ type: "error", message: "missing message or confirm" });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Core loop: call model → if tool calls, execute (or pause), loop. Stops when
// the model returns plain content or a confirmation is pending.
async function runAgentLoop(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  send: (e: SSEEvent) => void,
  maxSteps = 6,
): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    const history = await loadHistory(supabase, conversationId);
    const messages: ORMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
    ];

    const { content, tool_calls } = await openRouterChat(messages, ORTOOL_DEFS);

    // Persist the assistant turn (with tool_calls if any).
    await persistMessage(supabase, conversationId, userId, {
      role: "assistant",
      content: tool_calls ? null : content,
      tool_calls,
    });

    if (!tool_calls || tool_calls.length === 0) {
      // Stream the final text out as one delta. (Real token streaming would
      // require a streaming OpenRouter call; v1 keeps the loop simple.)
      if (content) send({ type: "text_delta", delta: content });
      return;
    }

    // For each tool call: confirm-required → pause and exit; auto → execute.
    let pausedForConfirm = false;
    for (const call of tool_calls) {
      const spec = TOOL_BY_NAME.get(call.function.name);
      if (!spec) {
        await persistMessage(supabase, conversationId, userId, {
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify({ error: "unknown tool" }),
        });
        continue;
      }

      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch (e) {
        args = {};
      }

      if (spec.requiresConfirm) {
        await logToolCall(
          supabase,
          userId,
          conversationId,
          spec.name,
          args,
          "pending_confirm",
        );
        send({
          type: "tool_call_pending",
          id: call.id,
          name: spec.name,
          args,
          preview: spec.preview(args),
        });
        pausedForConfirm = true;
        // Do not record a tool result yet — the next turn from the client
        // will arrive with a `confirm` payload.
      } else {
        await executeAndRecord(
          supabase,
          userId,
          conversationId,
          call.id,
          spec,
          args,
          send,
        );
      }
    }

    if (pausedForConfirm) return;
  }
}

async function runToolAndContinue(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  confirm: NonNullable<RequestBody["confirm"]>,
  send: (e: SSEEvent) => void,
): Promise<void> {
  const spec = TOOL_BY_NAME.get(confirm.tool_name);
  if (!spec) {
    send({
      type: "tool_result",
      id: confirm.tool_call_id,
      name: confirm.tool_name,
      ok: false,
      error: "unknown tool",
    });
    return;
  }

  if (!confirm.approve) {
    await persistMessage(supabase, conversationId, userId, {
      role: "tool",
      tool_call_id: confirm.tool_call_id,
      name: spec.name,
      content: JSON.stringify({ rejected: true }),
    });
    await logToolCall(
      supabase,
      userId,
      conversationId,
      spec.name,
      confirm.args,
      "rejected",
    );
    send({
      type: "tool_result",
      id: confirm.tool_call_id,
      name: spec.name,
      ok: false,
      error: "rejected",
    });
    // Continue loop so the model can recover (e.g. apologize or offer alternative).
    await runAgentLoop(supabase, userId, conversationId, send);
    return;
  }

  await executeAndRecord(
    supabase,
    userId,
    conversationId,
    confirm.tool_call_id,
    spec,
    confirm.args,
    send,
  );
  await runAgentLoop(supabase, userId, conversationId, send);
}

async function executeAndRecord(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  toolCallId: string,
  spec: ToolSpec,
  args: Record<string, unknown>,
  send: (e: SSEEvent) => void,
): Promise<void> {
  try {
    const result = await spec.execute(args, { supabase, userId });
    await logToolCall(
      supabase,
      userId,
      conversationId,
      spec.name,
      args,
      "executed",
      result as unknown,
    );
    await persistMessage(supabase, conversationId, userId, {
      role: "tool",
      tool_call_id: toolCallId,
      name: spec.name,
      content: JSON.stringify(result).slice(0, 8000),
    });
    send({ type: "tool_result", id: toolCallId, name: spec.name, ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logToolCall(
      supabase,
      userId,
      conversationId,
      spec.name,
      args,
      "failed",
      null,
      msg,
    );
    await persistMessage(supabase, conversationId, userId, {
      role: "tool",
      tool_call_id: toolCallId,
      name: spec.name,
      content: JSON.stringify({ error: msg }),
    });
    send({ type: "tool_result", id: toolCallId, name: spec.name, ok: false, error: msg });
  }
}

Deno.serve(handleRequest);
