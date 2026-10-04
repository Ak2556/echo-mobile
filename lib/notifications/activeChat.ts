/**
 * The conversation the user is looking at right now.
 *
 * A message from the person you are already talking to, in the thread you have
 * open, does not need a banner, a chime and a badge on top of the bubble that
 * just appeared. The notification handler (push.ts) asks `isChatOpen` before it
 * shows a DM push. Pure module state so it can be tested without Expo.
 */

let activeConversationId: string | null = null;

/** Called by the thread screen on focus (id) and on blur or unmount (null). */
export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

/**
 * Clears only if `id` is still the active one. A screen that is replaced by
 * another thread runs its cleanup after the new screen has registered; an
 * unconditional clear would wipe the new registration.
 */
export function clearActiveConversation(id: string): void {
  if (activeConversationId === id) activeConversationId = null;
}

/** True when this push is a DM for conversation `id`. */
export function isDmFor(data: Record<string, unknown> | null | undefined, id: string): boolean {
  return !!data && data.kind === 'dm' && data.target_id === id;
}

/** True when this push is a DM for the thread that is open on screen. */
export function isChatOpen(data: Record<string, unknown> | null | undefined): boolean {
  return !!activeConversationId && isDmFor(data, activeConversationId);
}
