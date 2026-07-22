import { onlineManager } from '@tanstack/react-query';
import { outbox } from '../store/outbox';
import { isAppOnline, initOnlineManager } from './net';
import { isTransientError } from './mutationErrors';
import { captureException } from './monitoring';
import {
  setRemoteLike,
  setRemoteBookmark,
  setRemoteRepost,
  setRemoteFollow,
} from './supabaseEchoApi';

/**
 * Replay handlers for queued writes. Each maps an outbox op `type` to the API
 * call that performs it. All handlers must be idempotent so a replay can't
 * duplicate — the toggles here are naturally idempotent (DB unique keys +
 * duplicate-swallow). Add new op types here as more flows are routed through
 * the outbox (publish, comment, DM, delete).
 */
type Handler = (payload: any) => Promise<unknown>;

const REGISTRY: Record<string, Handler> = {
  like: (p) => setRemoteLike(p.echoId, p.like),
  bookmark: (p) => setRemoteBookmark(p.echoId, p.bookmark),
  repost: (p) => setRemoteRepost(p.echoId, p.repost),
  follow: (p) => setRemoteFollow(p.userId, p.follow),
};

const MAX_ATTEMPTS = 8;
let draining = false;

/** Attempt every pending op once. Safe to call repeatedly; single-flight. */
export async function drainOutbox(): Promise<void> {
  if (draining || !isAppOnline()) return;
  draining = true;
  try {
    for (const op of outbox.pending()) {
      if (!isAppOnline()) break; // went offline mid-drain
      const handler = REGISTRY[op.type];
      if (!handler) {
        outbox.update(op.id, { status: 'failed', lastError: `unknown op type: ${op.type}` });
        continue;
      }
      try {
        await handler(op.payload);
        outbox.remove(op.id); // confirmed on the server → drop it
      } catch (e) {
        const message = (e as Error)?.message ?? 'write failed';
        if (isTransientError(e)) {
          const attempts = op.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            outbox.update(op.id, { status: 'failed', attempts, lastError: message });
            captureException(e, { tags: { outbox: op.type, terminal: 'max_attempts' } });
          } else {
            outbox.update(op.id, { attempts, lastError: message });
          }
        } else {
          // Permanent (4xx/RLS/constraint) — don't hammer; surface as failed.
          outbox.update(op.id, { status: 'failed', lastError: message });
          captureException(e, { tags: { outbox: op.type, terminal: 'permanent' } });
        }
      }
    }
  } finally {
    draining = false;
  }
}

/** Wire connectivity + drain triggers. Call once at app start. */
export function startOutbox(): void {
  initOnlineManager();
  onlineManager.subscribe(() => {
    if (onlineManager.isOnline()) void drainOutbox();
  });
  void drainOutbox();
}
