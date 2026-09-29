/**
 * Ids for a DM that exists only on this device: sending, or failed and waiting
 * for a tap to retry.
 *
 * The optimistic bubble carries the id the server row will have, so a retry
 * sends the same id again. If the first attempt landed after all (its response
 * was lost, or it outlived the 20-second client timeout), the retry hits the
 * primary key and counts as sent instead of posting a second copy.
 *
 * The prefixes drive the bubble's state in app/messages/[id].tsx.
 */
import { randomUUID } from 'expo-crypto';

const PENDING = 'pending-';
const FAILED = 'failed-';

/** A fresh message id, minted once when the user presses send. */
export function newDMClientId(): string {
  return randomUUID();
}

export function pendingDMId(clientId: string): string {
  return `${PENDING}${clientId}`;
}

/** The failed bubble keeps the message id of the send that failed. */
export function failedDMId(localId: string): string {
  return localId.startsWith(PENDING) ? FAILED + localId.slice(PENDING.length) : localId;
}

/** The message id a retry must reuse, or null when this is not a failed bubble. */
export function clientIdOfFailedDM(localId: string): string | null {
  return localId.startsWith(FAILED) ? localId.slice(FAILED.length) : null;
}

type LocalDM = { id: string; content?: string | null; replyToId?: string | null };

/**
 * The failed bubble a new send is really a retry of: same text, same reply
 * target. A failed send puts its text back in the composer, so pressing send
 * again is the common way to retry, and it must reuse the failed message's id
 * like the bubble's own retry does.
 */
export function failedDMMatching(messages: readonly LocalDM[], content: string, replyToId?: string | null): string | null {
  const reply = replyToId ?? null;
  const hit = messages.find(m => m.id.startsWith(FAILED) && m.content === content && (m.replyToId ?? null) === reply);
  return hit?.id ?? null;
}
