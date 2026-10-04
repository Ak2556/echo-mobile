/**
 * Row ids that survive a failed attempt, so the retry sends the same one.
 *
 * A write under a client timeout can land after the client gave up on it. If
 * the retry mints a new id, the server gets two rows; if it reuses the id,
 * the second insert hits the primary key and the caller treats that as sent.
 *
 * claim(key) returns the id already held for that key, or a new one. The id
 * is held until settle(key), which callers invoke once the write is known to
 * have succeeded (or has been handed to the outbox, which keys it itself). A
 * double tap while the first attempt is still in flight therefore also gets
 * the same id and cannot post twice.
 *
 * Module-level on purpose: leaving the compose screen and coming back to
 * resend must still find the id.
 */
export function createRetryIds(newId: () => string) {
  const held = new Map<string, string>();
  return {
    claim(key: string): string {
      let id = held.get(key);
      if (!id) {
        id = newId();
        held.set(key, id);
      }
      return id;
    },
    settle(key: string): void {
      held.delete(key);
    },
    /** Test seam. */
    size: () => held.size,
  };
}

/** Same echo, same reply target, same text: a resend, not a new comment. */
export function commentRetryKey(echoId: string, content: string, parentId?: string | null): string {
  return `${echoId}\u0000${parentId ?? ''}\u0000${content}`;
}
