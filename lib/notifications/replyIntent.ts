import { ACTION_REPLY, COMMENTABLE_KINDS } from './routing';
import { safeRouteId } from '../urlSafety';

/**
 * Turning a notification action response into something to send.
 *
 * Kept pure and separate from the code that performs the send so the routing
 * rules — which kinds accept a reply, what `target_id` means for each — can be
 * tested without a Supabase client or a notification runtime.
 */

export { ACTION_REPLY, CATEGORY_COMMENT, CATEGORY_DM, categoryForKind } from './routing';

/** Matches the DB limits these end up in; typed in a shade, not proofread. */
export const MAX_REPLY_LENGTH = 2000;

export type ReplyIntent =
  | { kind: 'dm'; conversationId: string; text: string }
  | { kind: 'comment'; echoId: string; text: string };

const COMMENTABLE = new Set(COMMENTABLE_KINDS);

export function resolveReplyIntent(
  actionIdentifier: string,
  userText: string | undefined,
  data: Record<string, unknown> | null | undefined,
): ReplyIntent | null {
  if (actionIdentifier !== ACTION_REPLY) return null;

  const text = (userText ?? '').trim().slice(0, MAX_REPLY_LENGTH);
  if (!text) return null;

  const kind = typeof data?.kind === 'string' ? data.kind : '';
  // Same field the tap router reads; for a DM it holds the conversation id, and
  // for a social notification the echo id.
  const targetId = safeRouteId(data?.target_id);
  if (!targetId) return null;

  if (kind === 'dm') return { kind: 'dm', conversationId: targetId, text };
  if (COMMENTABLE.has(kind)) return { kind: 'comment', echoId: targetId, text };

  return null;
}
