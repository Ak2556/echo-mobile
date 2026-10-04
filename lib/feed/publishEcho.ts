/**
 * Publish a post now, or hand it to the offline outbox if the network is what
 * failed.
 *
 * The insert runs under a 20 s client timeout that abandons the wait, not the
 * request. Treating that as "the post failed" lost posts both ways: a text
 * post publishes in the background after the composer has closed, so on
 * failure its words were simply gone; and a post that landed late was
 * reported as failed, so the user typed it again and it appeared twice.
 *
 * On a transient failure (timeout, offline, 5xx) the same payload, with the
 * same id, goes to the outbox, which retries with backoff. insertRemoteEcho
 * treats a duplicate id as the post already existing, so a late first
 * attempt and a replay can never make two posts. Only a permanent failure
 * (RLS, a constraint, a rejected payload) reaches the caller.
 */
import { insertRemoteEcho } from '../supabaseEchoApi';
import { isTransientError } from '../core/mutationErrors';
import { outbox } from '../../store/outbox';
import { drainOutbox } from '../core/outboxProcessor';

export type PublishPayload = Parameters<typeof insertRemoteEcho>[0] & { id: string };

export type PublishResult =
  | { status: 'published'; id: string }
  | { status: 'queued'; id: string };

export async function publishOrQueue(payload: PublishPayload): Promise<PublishResult> {
  try {
    const row = await insertRemoteEcho(payload);
    return { status: 'published', id: row.id };
  } catch (error) {
    if (!isTransientError(error)) throw error;
    outbox.enqueue('publish', payload);
    // The outbox drains on reconnect and on its own backoff timer; start it
    // now so an online blip does not wait for a connectivity change.
    void drainOutbox();
    return { status: 'queued', id: payload.id };
  }
}
