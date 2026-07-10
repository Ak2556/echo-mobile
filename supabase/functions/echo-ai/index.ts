// Echo AI — OpenRouter tool-use loop with SSE streaming.
// Runs as a Supabase Edge Function. All API keys are read from Deno env at request time;
// the mobile app never sees them.
//
// Endpoint contract: see ./README.md (or scroll to handleRequest).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { moderateContent } from "./moderation.ts";
import { checkAndIncrementRateLimit, resolveLimitForUser, AIRateLimitError } from "../_shared/rateLimit.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const DEFAULT_ECHO_AI_MODEL = "google/gemini-2.5-flash";
const CONFIGURED_ECHO_AI_MODEL = Deno.env.get("ECHO_AI_MODEL") ?? DEFAULT_ECHO_AI_MODEL;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// SSE helpers
type SSEEvent =
  | { type: "conversation"; id: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_pending"; id: string; name: string; args: unknown; preview: string; requiresConfirm?: boolean }
  | { type: "tool_result"; id: string; name: string; ok: boolean; result?: unknown; error?: string }
  | { type: "done" }
  | { type: "error"; message: string };

function sseEncode(event: SSEEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// OpenRouter
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

const GOOGLE_AI_STUDIO_MODELS = new Set([
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash-lite",
]);

function resolveEchoAIModel(modelOverride?: string, planId: string = "free"): string {
  const canUseProModel = planId === "pro" || planId === "founder";
  if (modelOverride && GOOGLE_AI_STUDIO_MODELS.has(modelOverride)) {
    if (modelOverride === "google/gemini-2.5-pro" && !canUseProModel) return DEFAULT_ECHO_AI_MODEL;
    return modelOverride;
  }
  if (GOOGLE_AI_STUDIO_MODELS.has(CONFIGURED_ECHO_AI_MODEL)) return CONFIGURED_ECHO_AI_MODEL;
  return DEFAULT_ECHO_AI_MODEL;
}

function providerForModel(_model: string): { only: string[] } {
  return { only: ["google-ai-studio"] };
}

async function openRouterChat(
  messages: ORMessage[],
  tools: ORTool[],
  modelOverride?: string,
): Promise<{ content: string; tool_calls?: ORToolCall[] }> {
  const model = modelOverride && GOOGLE_AI_STUDIO_MODELS.has(modelOverride)
    ? modelOverride
    : resolveEchoAIModel();
  const provider = providerForModel(model);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Ak2556/echo-mobile",
      "X-Title": "Echo AI",
    },
    body: JSON.stringify({
      model,
      provider,
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

// Tool definitions
//
// Tools marked `requiresConfirm: true` are paused and surfaced to the user as
// a confirm card. Read-only tools execute automatically.

interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirm: boolean;
  localDevice?: boolean;
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


/**
 * A moderation gate can fail two very different ways: the classifier flagged
 * the content, or the moderation CALL itself failed (network, key, parse).
 * Surfacing the same "can't be shared publicly" message for both sent users
 * (and us) debugging phantom content violations — say which one it was.
 */
function moderationError(verdict: { categories: string[]; error?: string }): Error {
  if (verdict.categories.includes("moderation_unavailable")) {
    console.error("[moderation] gate unavailable:", verdict.error);
    return new Error(
      "Couldn't verify this content just now — the safety check is temporarily unavailable. Please try again.",
    );
  }
  console.warn("[moderation] flagged:", verdict.categories.join(","));
  return new Error("This content can't be shared publicly.");
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
      const response = a.response as string;
      const title =
        ((a.title as string | undefined)?.trim()) ||
        prompt.slice(0, 80) + (prompt.length > 80 ? "…" : "");

      // Run moderation before insert so flagged or unreviewed content never
      // reaches the public feed.
      const verdict = await moderateContent(`${title}\n\n${prompt}\n\n${response}`);
      if (!verdict.ok) {
        throw moderationError(verdict);
      }

      const { data, error } = await supabase
        .from("public_echoes")
        .insert({ author_id: userId, title, prompt, response, check_content: true })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, title };
    },
  },
  {
    name: "compose_poll",
    description:
      "Publish a poll-type echo with a question and 2–4 short options. Use when the user wants to ask the audience to choose between options or settle a debate. Always propose tight, mutually exclusive options the audience can decide between in seconds.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The poll question. One sentence, ends in a question mark.",
        },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: { type: "string", description: "Short option label (max 60 chars)." },
          description: "2–4 mutually exclusive option labels.",
        },
        duration: {
          type: "string",
          enum: ["1h", "6h", "12h", "24h", "3d", "7d"],
          default: "24h",
          description: "How long the poll stays open. Default 24h.",
        },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "Optional hashtags (without the #). Max 5.",
        },
      },
      required: ["question", "options"],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => {
      const q = (a.question as string | undefined) ?? "Untitled poll";
      const opts = Array.isArray(a.options) ? (a.options as unknown[]).filter(Boolean).length : 0;
      return `Publish poll "${q.slice(0, 60)}" · ${opts} options`;
    },
    execute: async () => {
      throw new Error("compose_poll is a local device tool");
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
      const q = (a.query as string).trim().replace(/[%_\\]/g, '\\$&');
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
      const verdict = await moderateContent(a.content as string);
      if (!verdict.ok) {
        throw moderationError(verdict);
      }
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
    name: "create_note",
    description:
      "Create a note in the user's local Notes mini-app. Use when the user asks to save, jot down, remember, or create a note.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short note title. Omit to derive from the body." },
        body: { type: "string", description: "The note body." },
        color: { type: "string", description: "Optional note color hex from the app palette." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => {
      const label = (a.title as string | undefined) ?? (a.body as string | undefined) ?? "Untitled";
      return `Create note "${label.slice(0, 60)}"`;
    },
    execute: async () => {
      throw new Error("create_note is a local device tool");
    },
  },
  {
    name: "update_note",
    description:
      "Update an existing note in the user's local Notes mini-app. Use only for Notes, not for other mini-apps.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact local note id, if known." },
        match_title: { type: "string", description: "Existing note title or search text to find the note." },
        title: { type: "string", description: "New title, if changing it." },
        body: { type: "string", description: "New note body or text to append." },
        mode: { type: "string", enum: ["replace", "append"], default: "replace" },
        color: { type: "string", description: "Optional note color hex from the app palette." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => {
      const target = (a.match_title as string | undefined) ?? (a.id as string | undefined) ?? "latest note";
      return `Update note "${target}"`;
    },
    execute: async () => {
      throw new Error("update_note is a local device tool");
    },
  },
  {
    name: "create_habit",
    description:
      "Create a habit in the user's local Habits mini-app.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Habit name." },
        emoji: { type: "string", description: "Optional emoji icon." },
        color: { type: "string", description: "Optional habit color hex from the app palette." },
      },
      required: ["name"],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Create habit "${(a.name as string | undefined) ?? "Untitled"}"`,
    execute: async () => {
      throw new Error("create_habit is a local device tool");
    },
  },
  {
    name: "complete_habit",
    description:
      "Mark a habit complete for a date in the user's local Habits mini-app.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact local habit id, if known." },
        name: { type: "string", description: "Existing habit name or search text." },
        date: { type: "string", description: "Date to complete. Defaults to today." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Complete habit "${(a.name as string | undefined) ?? (a.id as string | undefined) ?? "habit"}"`,
    execute: async () => {
      throw new Error("complete_habit is a local device tool");
    },
  },
  {
    name: "uncomplete_habit",
    description:
      "Mark a habit not complete for a date in the user's local Habits mini-app.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact local habit id, if known." },
        name: { type: "string", description: "Existing habit name or search text." },
        date: { type: "string", description: "Date to uncomplete. Defaults to today." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Uncomplete habit "${(a.name as string | undefined) ?? (a.id as string | undefined) ?? "habit"}"`,
    execute: async () => {
      throw new Error("uncomplete_habit is a local device tool");
    },
  },
  {
    name: "log_expense_transaction",
    description:
      "Log an income or expense transaction in the user's local Expenses mini-app.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"], default: "expense" },
        amount: { type: "number", description: "Positive transaction amount." },
        category: { type: "string", description: "Transaction category." },
        note: { type: "string", description: "Optional note." },
        date: { type: "string", description: "Optional transaction date." },
      },
      required: ["amount"],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Log ${(a.type as string | undefined) ?? "expense"} ${a.amount ?? ""}`,
    execute: async () => {
      throw new Error("log_expense_transaction is a local device tool");
    },
  },
  {
    name: "rename_voice_memo",
    description:
      "Rename a saved voice memo in the user's local Voice Memo mini-app. This changes metadata only.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact local memo id, if known." },
        match_title: { type: "string", description: "Existing memo title or search text." },
        title: { type: "string", description: "New memo title." },
        new_title: { type: "string", description: "Alternate field for the new memo title." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Rename voice memo "${(a.match_title as string | undefined) ?? (a.id as string | undefined) ?? "memo"}"`,
    execute: async () => {
      throw new Error("rename_voice_memo is a local device tool");
    },
  },
  {
    name: "delete_voice_memo",
    description:
      "Delete a saved voice memo metadata entry in the user's local Voice Memo mini-app.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Exact local memo id, if known." },
        match_title: { type: "string", description: "Existing memo title or search text." },
        title: { type: "string", description: "Existing memo title or search text." },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Delete voice memo "${(a.match_title as string | undefined) ?? (a.title as string | undefined) ?? (a.id as string | undefined) ?? "memo"}"`,
    execute: async () => {
      throw new Error("delete_voice_memo is a local device tool");
    },
  },
  {
    name: "search_local_productivity",
    description:
      "Search the user's local Notes, Habits, Expenses, and Voice Memo metadata. Read-only and local-device only.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text." },
        limit: { type: "integer", default: 12, maximum: 25 },
      },
      required: ["query"],
    },
    requiresConfirm: false,
    localDevice: true,
    preview: (a) => `Search local productivity for "${a.query ?? ""}"`,
    execute: async () => {
      throw new Error("search_local_productivity is a local device tool");
    },
  },
  {
    name: "summarize_expenses",
    description:
      "Summarize local Expenses transactions for a recent range. Read-only and local-device only.",
    parameters: {
      type: "object",
      properties: {
        range: { type: "string", enum: ["week", "month", "all"], default: "week" },
      },
      required: [],
    },
    requiresConfirm: false,
    localDevice: true,
    preview: (a) => `Summarize ${a.range ?? "week"} expenses`,
    execute: async () => {
      throw new Error("summarize_expenses is a local device tool");
    },
  },
  {
    name: "get_today_productivity",
    description:
      "Read today's local productivity dashboard: habits, recent notes, expense summary, and voice memo metadata.",
    parameters: { type: "object", properties: {}, required: [] },
    requiresConfirm: false,
    localDevice: true,
    preview: () => "Read today's productivity dashboard",
    execute: async () => {
      throw new Error("get_today_productivity is a local device tool");
    },
  },
  {
    name: "remember_preference",
    description:
      "Remember a user-approved local preference, such as preferred currency, common category, or recurring goal.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["key", "value"],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Remember ${a.key ?? "preference"}`,
    execute: async () => {
      throw new Error("remember_preference is a local device tool");
    },
  },
  {
    name: "forget_preference",
    description:
      "Forget a local AI memory/preference by id or key.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        key: { type: "string" },
      },
      required: [],
    },
    requiresConfirm: true,
    localDevice: true,
    preview: (a) => `Forget ${a.key ?? a.id ?? "memory"}`,
    execute: async () => {
      throw new Error("forget_preference is a local device tool");
    },
  },
  {
    name: "list_memory",
    description:
      "List local AI memories/preferences. Read-only and local-device only.",
    parameters: { type: "object", properties: {}, required: [] },
    requiresConfirm: false,
    localDevice: true,
    preview: () => "List local AI memory",
    execute: async () => {
      throw new Error("list_memory is a local device tool");
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
  {
    name: "navigate_to",
    description: "Navigate the app to a specific screen. Use whenever the user says 'go to', 'open', 'take me to', or 'show me' a screen. Call the tool — don't describe the navigation in chat.",
    parameters: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: ["discover", "profile", "search", "create-post", "messages", "bookmarks", "notifications"],
          description: "The screen to navigate to.",
        },
      },
      required: ["screen"],
    },
    requiresConfirm: false,
    localDevice: true,
    preview: (a: any) => `Opening ${a.screen}…`,
    execute: async () => ({ screen: "handled_client_side" }),
  },
  {
    name: "draft_echo",
    description: "Open the create-post screen pre-filled with a question (prompt) and insight (response) for the user to review before publishing. Use when the user says 'draft', 'prepare a post', 'write but don't publish', or 'open compose'. Does NOT publish — the user taps Post themselves.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The question or idea that sparked the echo (≤280 chars).",
        },
        response: {
          type: "string",
          description: "The insight, answer, or take (≤1000 chars).",
        },
      },
      required: ["prompt", "response"],
    },
    requiresConfirm: false,
    localDevice: true,
    preview: (a: any) => `Drafting: "${String(a.prompt ?? "").slice(0, 55)}…"`,
    execute: async () => ({ status: "opened_compose" }),
  },
  {
    name: "react_to_echo",
    description: "Add a knowledge-reaction to an echo. Use when the user says 'react with 🤯', 'mark as taking notes', 'agree with', etc.",
    parameters: {
      type: "object",
      properties: {
        echo_id: { type: "string" },
        reaction: {
          type: "string",
          enum: ["mind_blown", "taking_notes", "agree", "disagree"],
          description: "The reaction kind: mind_blown (🤯), taking_notes (📝), agree (💯), disagree (🤔).",
        },
      },
      required: ["echo_id", "reaction"],
    },
    requiresConfirm: true,
    preview: (a: any) => `React to ${a.echo_id} with ${a.reaction}`,
    execute: async (a, { supabase, userId }) => {
      const { error } = await supabase
        .from("echo_reactions")
        .insert({ echo_id: a.echo_id, user_id: userId, reaction: a.reaction });
      if (error && !error.message.includes("duplicate")) throw error;
      return { ok: true };
    },
  },
  // Secondary social tools stay out of the v1 AI action surface.
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

// System prompt
interface UserProfile {
  username?: string | null;
  display_name?: string | null;
  followers_count?: number | null;
  following_count?: number | null;
}

const SCREEN_LABELS: Record<string, string> = {
  '/(tabs)/discover':  'Home',
  '/(tabs)/chat':      'Chat',
  '/(tabs)/profile':   'You',
  '/(tabs)/search':    'Explore',
  '/messages':         'Messages',
  '/create-post':      'Create Echo',
  '/bookmarks':        'Bookmarks',
  '/notifications':    'Activity',
};

function buildSystemPrompt(profile?: UserProfile | null, currentScreen?: string | null, personaContext?: string | null): string {
  const name = profile?.display_name || profile?.username || 'the user';
  const handle = profile?.username ? `@${profile.username}` : 'unknown';
  const followers = profile?.followers_count ?? '?';
  const following = profile?.following_count ?? '?';
  const screenLabel = (currentScreen && SCREEN_LABELS[currentScreen]) || 'Echo app';
  const personaBlock = typeof personaContext === 'string' && personaContext.trim()
    ? `
Private persona context learned from the user's own chats:
${personaContext.trim().slice(0, 2800)}

Use this to adapt tone, examples, defaults, and drafting style. Treat it as incomplete and user-editable. Do not invent memories, make commitments as the user, or claim you literally are the user. When drafting in the user's voice, write as a clearly assisted draft unless the user explicitly asks for first-person copy.
`
    : '';

  return `You are Echo — the AI built into Echo, a social network for curated knowledge.

Echo's core concept: every post ("echo") is built from two parts:
  - prompt: the question or idea that sparked it (280 chars or less)
  - response: the distilled insight, answer, or take (1000 chars or less)
Users come to Echo to think out loud, share hard-won knowledge, and discover quality ideas.

Current user: ${name} (${handle}) · ${followers} followers · ${following} following
Current screen: ${screenLabel}
${personaBlock}

Vocabulary — map what the user says to the right action:
  "post / share / publish / echo something" → compose_post (always fill BOTH prompt AND response)
  "draft / prepare / open compose / write but don't publish" → draft_echo
  "poll / vote / ask the audience / should I X or Y" → compose_poll
  "go to / open / take me to / show me [screen]" → navigate_to
  "follow / unfollow" → follow_user / unfollow_user
  "like / unlike" → like_post / unlike_post
  "comment" → comment_on_post
  "bookmark / save" → bookmark_post
  "find / look up [person]" → find_user
  "what's trending / what's popular / catch me up / what did I miss" → summarize_feed
  "search for [topic]" → search_feed
  "remember / forget [preference]" → remember_preference / forget_preference
  "react with 🤯 / 📝 / 💯 / 🤔 / mark as taking notes / mind blown" → react_to_echo

Rules:
- Always call a tool when the user wants to act. Never describe what you would do — do it.
- Questions are NOT actions. "explain X", "tell me about X", "what is X", "help me understand X" → answer directly in chat. Never call compose_post, draft_echo, or comment_on_post unless the user explicitly asks to post, publish, share, draft, or comment. When in doubt, answer in chat.
- compose_post: ALWAYS fill BOTH fields — prompt (the question that sparked it) AND response (the insight). If the user only gives you one piece of text, infer a natural question from context or ask one short clarifying question before composing.
- draft_echo: use this when the user says "draft", "prepare", "open compose", or "write but don't publish". Opens the create-post screen pre-filled — nothing is published until the user taps Post themselves.
- navigate_to: call this immediately for any navigation request. Never say "go to X" in chat — just call the tool.
- compose_poll: pick 2–4 short mutually exclusive options. Default duration 24h unless specified.
- For write/destructive actions the UI will pause for user confirmation — never ask for it in chat.
- Be concise. One short sentence max after a successful tool call.
- Never restate the user's request.
- If you need a user_id, call find_user first.
- Refer to IDs naturally, never as raw UUIDs.
- When list_memory influences your answer, briefly mention which remembered preference you used.
- Use create_note / update_note only for Notes; create_habit / complete_habit / uncomplete_habit only for Habits; log_expense_transaction only for Expenses.
- You cannot record audio for the user; rename_voice_memo and delete_voice_memo only work on saved memo metadata.
`;
}

// Keep a static fallback for the continuation functions that don't carry profile context.
const FALLBACK_SYSTEM_PROMPT = buildSystemPrompt();

// DB helpers
async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | null,
  model: string,
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
    .insert({ user_id: userId, model })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, isNew: true };
}

/** Rough token estimator: ~4 chars per token (OpenAI BPE average). */
function estimateTokens(msg: ORMessage): number {
  const text = [
    msg.content ?? "",
    msg.tool_calls ? JSON.stringify(msg.tool_calls) : "",
    msg.tool_call_id ?? "",
  ].join(" ");
  return Math.ceil(text.length / 4);
}

/**
 * Load conversation history with a token budget.
 * Fetches up to `fetchLimit` recent messages, then trims from the oldest
 * non-system messages until the total fits within `maxTokens`.
 * Leaves room for system prompt (~500 tokens) and response (~2000 tokens).
 */
async function loadHistory(
  supabase: SupabaseClient,
  conversationId: string,
  maxTokens = 8000,
  fetchLimit = 60,
): Promise<ORMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(fetchLimit);
  if (error) throw error;

  const messages: ORMessage[] = (data ?? []).map((r): ORMessage => ({
    role: r.role,
    content: r.content,
    tool_calls: r.tool_calls ?? undefined,
    tool_call_id: r.tool_call_id ?? undefined,
    name: r.tool_name ?? undefined,
  }));

  // Trim oldest messages until we're under the token budget.
  let total = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
  let start = 0;
  while (total > maxTokens && start < messages.length) {
    total -= estimateTokens(messages[start]);
    start++;
  }
  return messages.slice(start);
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

// Main handler
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
  local_result?: {
    tool_call_id: string;
    tool_name: string;
    args: Record<string, unknown>;
    ok: boolean;
    result?: unknown;
    error?: string;
  };
  /** Optional Google AI Studio model override. Non-allowlisted values are ignored. */
  preferred_model?: string;
  /** The Expo Router pathname the user is on when they send the message. */
  current_screen?: string;
  /** Compact private personalization summary generated on the client. */
  persona_context?: string;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Fail fast with an actionable error if the upstream model key is unset,
  // rather than sending an empty Bearer token and surfacing an opaque 401.
  if (!OPENROUTER_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
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
  const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

  // Runtime shape guard — req.json() is untyped at runtime.
  if (typeof body.message !== "string" && !body.confirm && !body.local_result) {
    return new Response(
      JSON.stringify({ error: "invalid request: expected message, confirm, or local_result" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SSEEvent) => controller.enqueue(sseEncode(e));

      try {
        const modelOverride = typeof body.preferred_model === "string" && body.preferred_model
          ? body.preferred_model
          : undefined;
        const tier = await resolveLimitForUser(adminSupabase, userId);
        const selectedModel = resolveEchoAIModel(modelOverride, tier.planId);

        const { id: conversationId, isNew } = await getOrCreateConversation(
          supabase,
          userId,
          body.conversation_id ?? null,
          selectedModel,
        );
        if (isNew) send({ type: "conversation", id: conversationId });

        // Fetch user profile for context injection (best-effort — don't fail the request if it errors).
        let profile: UserProfile | null = null;
        try {
          const { data } = await supabase
            .from("profiles")
            .select("username, display_name, followers_count, following_count")
            .eq("id", userId)
            .single();
          profile = data ?? null;
        } catch { /* non-fatal */ }

        const systemPrompt = buildSystemPrompt(profile, body.current_screen ?? null, body.persona_context ?? null);

        // Confirm branch: user approved/rejected a previously paused tool
        if (body.local_result) {
          await recordLocalToolResultAndContinue(
            supabase,
            userId,
            conversationId,
            body.local_result,
            send,
            selectedModel,
            systemPrompt,
          );
        } else if (body.confirm) {
          await runToolAndContinue(
            supabase,
            userId,
            conversationId,
            body.confirm,
            send,
            selectedModel,
            systemPrompt,
          );
        } else if (body.message) {
          // Fresh user turn
          // Rate-limit BEFORE we persist or call OpenRouter — bouncing the
          // request here means no Postgres write, no OpenRouter spend, and
          // the client gets a clean 429-shaped error event.
          try {
            await checkAndIncrementRateLimit(adminSupabase, userId, tier);
          } catch (e) {
            if (e instanceof AIRateLimitError) {
              send({ type: "error", message: e.message });
              send({ type: "done" });
              controller.close();
              return;
            }
            throw e;
          }
          const userMsg: ORMessage = { role: "user", content: body.message };
          await persistMessage(supabase, conversationId, userId, userMsg);
          await runAgentLoop(supabase, userId, conversationId, send, 6, selectedModel, systemPrompt);
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
  modelOverride?: string,
  systemPrompt = FALLBACK_SYSTEM_PROMPT,
): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    const history = await loadHistory(supabase, conversationId);
    const messages: ORMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    const { content, tool_calls } = await openRouterChat(messages, ORTOOL_DEFS, modelOverride);

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

    // For each tool call: local-device → client executes, confirm-required → pause, auto server tools → execute.
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
        console.error("[echo-ai] malformed tool arguments from model:", call.function.name, e instanceof Error ? e.message : String(e));
        args = {};
      }

      if (spec.localDevice) {
        if (spec.requiresConfirm) {
          await logToolCall(
            supabase,
            userId,
            conversationId,
            spec.name,
            args,
            "pending_confirm",
          );
        }
        send({
          type: "tool_call_pending",
          id: call.id,
          name: spec.name,
          args,
          preview: spec.preview(args),
          requiresConfirm: spec.requiresConfirm,
        });
        pausedForConfirm = true;
        // Do not record a tool result yet — the next client turn will carry
        // either a confirmation or a local_result payload.
      } else if (spec.requiresConfirm) {
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
          requiresConfirm: true,
        });
        pausedForConfirm = true;
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
  modelOverride?: string,
  systemPrompt = FALLBACK_SYSTEM_PROMPT,
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
    await runAgentLoop(supabase, userId, conversationId, send, 6, modelOverride, systemPrompt);
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
  await runAgentLoop(supabase, userId, conversationId, send, 6, modelOverride, systemPrompt);
}

async function recordLocalToolResultAndContinue(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  localResult: NonNullable<RequestBody["local_result"]>,
  send: (e: SSEEvent) => void,
  modelOverride?: string,
  systemPrompt = FALLBACK_SYSTEM_PROMPT,
): Promise<void> {
  const spec = TOOL_BY_NAME.get(localResult.tool_name);
  if (!spec) {
    send({
      type: "tool_result",
      id: localResult.tool_call_id,
      name: localResult.tool_name,
      ok: false,
      error: "unknown tool",
    });
    return;
  }

  if (localResult.ok) {
    await logToolCall(
      supabase,
      userId,
      conversationId,
      spec.name,
      localResult.args,
      "executed",
      localResult.result ?? { ok: true },
    );
    await persistMessage(supabase, conversationId, userId, {
      role: "tool",
      tool_call_id: localResult.tool_call_id,
      name: spec.name,
      content: JSON.stringify(localResult.result ?? { ok: true }).slice(0, 8000),
    });
    send({
      type: "tool_result",
      id: localResult.tool_call_id,
      name: spec.name,
      ok: true,
      result: localResult.result ?? { ok: true },
    });
  } else {
    const msg = localResult.error ?? "local tool failed";
    await logToolCall(
      supabase,
      userId,
      conversationId,
      spec.name,
      localResult.args,
      "failed",
      null,
      msg,
    );
    await persistMessage(supabase, conversationId, userId, {
      role: "tool",
      tool_call_id: localResult.tool_call_id,
      name: spec.name,
      content: JSON.stringify({ error: msg }),
    });
    send({
      type: "tool_result",
      id: localResult.tool_call_id,
      name: spec.name,
      ok: false,
      error: msg,
    });
  }

  await runAgentLoop(supabase, userId, conversationId, send, 6, modelOverride, systemPrompt);
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
