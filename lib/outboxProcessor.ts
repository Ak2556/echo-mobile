import { onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { outbox } from '../store/outbox';
import { isAppOnline, initOnlineManager } from './net';
import { isDuplicateError, isTransientError } from './mutationErrors';
import { captureException } from './monitoring';
import { backoffMs, isDue, isExpiredFailure, nextWake } from './outboxPolicy';
import {
  setRemoteLike,
  setRemoteBookmark,
  setRemoteRepost,
  setRemoteFollow,
  insertRemoteEcho,
  uploadEchoImages,
  uploadEchoVideo,
  insertRemoteComment,
  setRemoteCommentLike,
  setRemoteEchoReaction,
  submitDailyAnswer,
} from './supabaseEchoApi';

/**
 * Replay handlers for queued writes. Each maps an outbox op `type` to the API
 * call that performs it. All handlers must be idempotent so a replay can't
 * duplicate — the toggles here are naturally idempotent (DB unique keys +
 * duplicate-swallow). Add new op types here as more flows are routed through
 * the outbox.
 *
 * IDEMPOTENCE IS THE ADMISSION FEE. A drain can run twice — the app is
 * foregrounded, the network flaps, a request succeeds but its response is lost.
 * Every handler below must therefore be safe to replay:
 *
 *   like / bookmark / repost / follow  set a state, they do not flip one, and
 *                                      the DB has unique keys
 *   echoReaction                       same: an explicit on/off, not a toggle
 *   commentLike                        same
 *   dailyAnswer                        an upsert keyed on (user, question)
 *   comment                            NOT naturally idempotent — see below
 *   publish                            carries a client-supplied id
 *
 * A comment is the awkward one: replaying an insert would post it twice. It
 * carries a clientId so the insert can be deduplicated, and it is the reason
 * this registry is worth reading before adding an op rather than after.
 */
type Handler = (payload: any, opId: string) => Promise<unknown>;

const REGISTRY: Record<string, Handler> = {
  like: (p) => setRemoteLike(p.echoId, p.like),
  bookmark: (p) => setRemoteBookmark(p.echoId, p.bookmark),
  repost: (p) => setRemoteRepost(p.echoId, p.repost),
  follow: (p) => setRemoteFollow(p.userId, p.follow),
  comment: (p, opId) => insertRemoteComment(p.echoId, p.content, p.parentId, p.clientId ?? opId),
  commentLike: (p) => setRemoteCommentLike(p.commentId, p.like),
  echoReaction: (p) => setRemoteEchoReaction(p.echoId, p.reaction, p.on),
  dailyAnswer: (p) => submitDailyAnswer(p.questionId, p.answer),
  publish: async (p, opId) => {
    const local = p.mediaUrls && p.mediaUrls.length > 0 && p.mediaUrls[0].startsWith('file://');
    if (local && (p.postType === 'photo' || p.postType === 'video')) {
      const mediaUrls = p.postType === 'photo'
        ? await uploadEchoImages(p.mediaUrls)
        : [(await uploadEchoVideo(p.mediaUrls[0]))];
      p = { ...p, mediaUrls };
      // Checkpoint before the next step. Without it a failed insert left the
      // stored op pointing at the local files, so every retry uploaded the
      // media again (orphaning the last copy), and failed for good once the OS
      // had cleared the cached file.
      outbox.update(opId, { payload: p });
    }
    return insertRemoteEcho(p);
  },
};

const MAX_ATTEMPTS = 8;
let draining = false;
let wake: ReturnType<typeof setTimeout> | null = null;

/**
 * One timer, set for the earliest op that is waiting out its backoff. A
 * deadline, not a poll: nothing is scheduled while no op is waiting.
 *
 * Transient failures used to bump a counter and wait for the next
 * offline-to-online transition or cold start, so a 5xx on a steady connection
 * sat in the outbox until the app was restarted.
 */
function scheduleWake(): void {
  if (wake) clearTimeout(wake);
  wake = null;
  const now = Date.now();
  const at = nextWake(outbox.pending(), now);
  if (at !== null) wake = setTimeout(() => { wake = null; void drainOutbox(); }, at - now);
}

/** Attempt every op that is due. Safe to call repeatedly; single-flight. */
export async function drainOutbox(): Promise<void> {
  if (draining || !isAppOnline()) return;
  draining = true;
  try {
    for (const op of outbox.pending()) {
      if (!isAppOnline()) break; // went offline mid-drain
      if (!isDue(op, Date.now())) continue; // still backing off
      // pending() is a snapshot. A sign-out mid-drain clears the queue, and the
      // rest of the snapshot must not be sent under the next session.
      if (!outbox.all().some(o => o.id === op.id)) continue;
      const handler = REGISTRY[op.type];
      if (!handler) {
        outbox.update(op.id, { status: 'failed', lastError: `unknown op type: ${op.type}` });
        continue;
      }
      try {
        await handler(op.payload, op.id);
        outbox.remove(op.id); // confirmed on the server → drop it
      } catch (e) {
        const message = (e as Error)?.message ?? 'write failed';
        // A duplicate means an earlier attempt reached the server and only its
        // response was lost. The write is done; dropping the op is correct and
        // retrying would be wrong.
        if (isDuplicateError(e)) {
          outbox.remove(op.id);
          continue;
        }
        if (isTransientError(e)) {
          const attempts = op.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            outbox.update(op.id, { status: 'failed', attempts, lastError: message });
            captureException(e, { tags: { outbox: op.type, terminal: 'max_attempts' } });
          } else {
            outbox.update(op.id, { attempts, lastError: message, nextAttemptAt: Date.now() + backoffMs(attempts) });
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
    scheduleWake();
  }
}

/**
 * Drop writes that failed for good more than a week ago. Each was reported
 * when it failed; kept for ever they only grow the persisted store.
 */
function expireFailed(): void {
  const now = Date.now();
  for (const op of outbox.all()) {
    if (isExpiredFailure(op, now)) outbox.remove(op.id);
  }
}

/** Wire connectivity + drain triggers. Call once at app start. */
export function startOutbox(): void {
  initOnlineManager();
  expireFailed();
  onlineManager.subscribe(() => {
    if (onlineManager.isOnline()) void drainOutbox();
  });
  // Returning to the app is when a user expects pending posts to go out, and
  // timers do not run while it is suspended.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void drainOutbox();
  });
  void drainOutbox();
}
