/**
 * Decrypted messages this session has seen, with their message keys. Kept
 * only in memory and cleared on sign-out. It exists for three things that need
 * plaintext after the render pass: editing (reuse the key), forwarding
 * (re-seal for someone else) and reporting (disclose to moderators).
 */
export type CachedMessage = {
  id: string;
  text: string;
  conversationId: string;
  senderId: string;
  createdAt: string;
  /** The body nonce this text belongs to; an edit elsewhere changes it. */
  nonce: string;
  messageKey: Uint8Array;
};

const MAX_ENTRIES = 2000;
const entries = new Map<string, CachedMessage>();

export function rememberMessage(entry: CachedMessage): void {
  entries.delete(entry.id);
  entries.set(entry.id, entry);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
}

/** With `nonce`, a hit only if the cached text is still the current version. */
export function recallMessage(id: string, nonce?: string): CachedMessage | undefined {
  const hit = entries.get(id);
  if (!hit) return undefined;
  if (nonce !== undefined && hit.nonce !== nonce) return undefined;
  return hit;
}

export function recallConversation(conversationId: string): CachedMessage[] {
  return [...entries.values()]
    .filter(e => e.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function clearMessageCache(): void {
  entries.clear();
}
