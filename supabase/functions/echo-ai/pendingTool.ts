// Which tool calls a conversation is still waiting on.
//
// The confirm and local_result branches of the handler used to take a
// tool_call_id, tool_name and args from the client and act on them without
// asking whether the model had ever issued that call. Combined with the branch
// not being rate limited, a client could replay a made-up confirm and drive the
// agent loop (up to six model calls) as often as it liked.
//
// A call is pending when an assistant message in this conversation issued it and
// no tool message has answered it yet. That also makes a confirm single-use:
// once its result is stored, the same id is no longer pending.

export interface StoredMessageRow {
  role: string;
  tool_calls?: unknown;
  tool_call_id?: string | null;
}

/** The pending call with this id, or null when there is none. */
export function findPendingToolCall(rows: StoredMessageRow[], toolCallId: unknown): { name: string } | null {
  if (typeof toolCallId !== 'string' || !toolCallId) return null;

  for (const row of rows) {
    if (row.role === 'tool' && row.tool_call_id === toolCallId) return null;
  }

  let found: { name: string } | null = null;
  for (const row of rows) {
    if (row.role !== 'assistant' || !Array.isArray(row.tool_calls)) continue;
    for (const call of row.tool_calls as unknown[]) {
      const c = call as { id?: unknown; function?: { name?: unknown } } | null;
      if (c && c.id === toolCallId && typeof c.function?.name === 'string') found = { name: c.function.name };
    }
  }
  return found;
}
