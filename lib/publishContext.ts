import type { ConversationSnapshotMessage } from '../types';

// Ephemeral context handed from chat/remix screens to the share screen.
// URL params can't carry the full multi-turn snapshot (size + escape pain),
// so we stage it here and the share screen reads + clears it on publish.
export interface PendingPublishContext {
  conversationSnapshot?: ConversationSnapshotMessage[];
  sourceConversationId?: string;
  parentEchoId?: string;
  parentAuthorUsername?: string;
  parentTitle?: string;
  // Optional pre-filled drafts when remixing.
  initialTitle?: string;
  initialAuthorNote?: string;
}

let pending: PendingPublishContext | null = null;

export function setPendingPublishContext(ctx: PendingPublishContext): void {
  pending = ctx;
}

export function consumePendingPublishContext(): PendingPublishContext | null {
  const out = pending;
  pending = null;
  return out;
}

export function peekPendingPublishContext(): PendingPublishContext | null {
  return pending;
}

export function clearPendingPublishContext(): void {
  pending = null;
}
