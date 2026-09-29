// One handler per queue. A handler returns when the job is done (or decided not
// to act), throws when the job should be tried again, and calls ctx.report for
// an outcome worth an operator's attention that retrying cannot improve.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { deliverNotification } from '../push-fanout/deliver.ts';
import { judgeEcho } from '../embed-echo/judge.ts';
import { entitlementFor, type RcSubscriber } from '../revenuecat-webhook/entitlements.ts';
import { judgeRequest } from '../verify-identity/judge.ts';
import { runErasure } from '../delete-account/erasure.ts';
import { dmMediaKey } from '../_shared/dmMediaKey.ts';
import { MAX_PUSH_AGE_MS, isStale } from './policy.ts';
import { pruneDeadTokens, sendToExpo, tokensByUser } from '../_shared/expoPush.ts';
import { pickTitle, truncate } from '../daily-question-push/copy.ts';
import { channelForKind, priorityForKind } from '../../../lib/notifications/routing.ts';

export interface JobContext {
  // deno-lint-ignore no-explicit-any
  db: SupabaseClient<any, any, any>;
  enqueuedAt: string;
  /** Record in the dead-letter queue without failing this job. */
  report(error: string): Promise<void>;
}

export type Handler = (msg: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/** A notifications row, delivered to every device its recipient is signed in on. */
const push: Handler = async (msg, ctx) => {
  if (isStale(ctx.enqueuedAt, Date.now(), MAX_PUSH_AGE_MS)) {
    console.warn('[worker:push] dropping a push older than the age limit', msg.notification_id);
    return;
  }
  const { data: n, error } = await ctx.db
    .from('notifications')
    .select('user_id, type, target_id, target_kind, actor_id, preview')
    .eq('id', String(msg.notification_id))
    .maybeSingle();
  if (error) throw error;
  if (!n) return; // the row is gone; there is nothing to deliver

  const result = await deliverNotification(ctx.db, n);
  if ('skipped' in result) return;

  const { outcome } = result;
  if (outcome.fatal.length === 0) return;
  const detail = outcome.fatal.map((f) => f.error).join('; ');
  // Nothing reached any device, so a retry cannot duplicate anything.
  if (outcome.accepted.length === 0) throw new Error(`expo rejected every device: ${detail}`);
  // Some devices have it. Retrying would buzz those twice, so record the rest.
  await ctx.report(`partial delivery to ${n.user_id}: ${detail}`);
};

/** A new or edited echo: judge it, record the verdict, embed it if it passed. */
const moderation: Handler = async (msg, ctx) => {
  const echoId = String(msg.echo_id);
  // Edits clear moderated_at (d_bump_echo_content_version), so a value here
  // means the current text already has a verdict: a duplicate job, not work.
  const { data: row, error } = await ctx.db
    .from('public_echoes')
    .select('moderated_at')
    .eq('id', echoId)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.moderated_at) return;

  const r = await judgeEcho(ctx.db, echoId, { inlineRetries: 0 });
  switch (r.kind) {
    case 'unavailable':
      throw new Error('moderation unavailable');
    case 'verdict_not_saved':
      throw new Error(`verdict not saved: ${r.error}`);
    case 'embed_failed':
    case 'embedding_not_saved':
      // The verdict is recorded, so visibility is right; only ranking lacks
      // the vector. Re-judging to retry the embedding would spend moderation
      // quota on a post that is already decided.
      await ctx.report(`${r.kind} for ${echoId}: ${r.error}`);
      return;
    default:
      return;
  }
};

/**
 * One user's subscription, read from RevenueCat's resolved state and written
 * to user_entitlements. Safe to run any number of times, in any order.
 */
const entitlements: Handler = async (msg, ctx) => {
  const userId = String(msg.user_id);
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) throw new Error('REVENUECAT_SECRET_KEY is not set');
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`RevenueCat ${r.status}`);
  const body = (await r.json()) as { subscriber?: RcSubscriber };
  const { error } = await ctx.db.rpc('apply_store_entitlement', {
    p_user: userId,
    p_row: entitlementFor(body.subscriber ?? {}, Date.now()),
  });
  if (error) throw error;
};

/**
 * Today's question to a batch of up to 100 users, on every device each is
 * signed in on. claim_daily_broadcast enqueues these once per day.
 */
const broadcast: Handler = async (msg, ctx) => {
  const userIds = Array.isArray(msg.user_ids) ? (msg.user_ids as string[]) : [];
  if (userIds.length === 0) return;
  // "Today's question" hours late is yesterday's question.
  if (isStale(ctx.enqueuedAt, Date.now(), MAX_PUSH_AGE_MS)) {
    console.warn('[worker:broadcast] dropping a batch older than the age limit', msg.question_id);
    return;
  }
  const { data: q, error } = await ctx.db
    .from('daily_questions')
    .select('id, question')
    .eq('id', String(msg.question_id))
    .maybeSingle();
  if (error) throw error;
  if (!q) return;

  const byUser = await tokensByUser(ctx.db, userIds);
  const body = truncate(q.question, 150);
  const messages = [...byUser.values()].flat().map((to) => ({
    to,
    title: pickTitle(),
    body,
    sound: 'default',
    channelId: channelForKind('daily_question'),
    priority: priorityForKind('daily_question'),
    data: { kind: 'daily_question', target_id: q.id },
  }));
  if (messages.length === 0) return;

  const outcome = await sendToExpo(messages);
  await pruneDeadTokens(ctx.db, outcome.dead);
  if (outcome.fatal.length === 0) return;
  const detail = [...new Set(outcome.fatal.map((f) => f.error))].join('; ');
  // Nothing reached any device, so a retry cannot duplicate anything.
  if (outcome.accepted.length === 0) throw new Error(`expo rejected the whole batch: ${detail}`);
  await ctx.report(`daily question reached ${outcome.accepted.length} of ${messages.length} devices: ${detail}`);
};

/**
 * A verification request the model could not judge at submit time. Retried
 * with backoff; after the last attempt it is dead-lettered and stays in the
 * moderators' pending list, where it always was.
 */
const verification: Handler = async (msg, ctx) => {
  const outcome = await judgeRequest(ctx.db, String(msg.request_id));
  if (outcome.status === 'unavailable') throw new Error('vision model unavailable');
};

/** An account erasure, resumed from the step it reached. */
const erasure: Handler = async (msg, ctx) => {
  await runErasure(ctx.db, String(msg.user_id));
};

/**
 * The photo or voice note of a deleted DM, from R2 and from the legacy
 * Storage bucket. Only keys in the sender's own folder are touched: media_url
 * is client-written and could name someone else's file (dmMediaKey).
 */
const mediaGc: Handler = async (msg, ctx) => {
  if (msg.bucket !== 'dm-media') return;
  const values = Object.values((msg.values ?? {}) as Record<string, unknown>);
  const keys = [...new Set(values.map((v) => dmMediaKey(v, msg.sender_id)).filter((k): k is string => !!k))];
  if (keys.length < values.length) {
    // Not an error to retry: a value outside the sender's folder is never ours
    // to delete, whether it is an old URL shape or a pointer at another file.
    console.warn('[worker:media_gc] left alone: value outside the sender folder', msg.sender_id);
  }
  const workerUrl = (Deno.env.get('CLOUDFLARE_WORKER_URL') ?? '').replace(/\/$/, '');
  const secret = Deno.env.get('PURGE_SECRET') ?? '';
  if (keys.length && (!workerUrl || !secret)) throw new Error('media purge is not configured (CLOUDFLARE_WORKER_URL, PURGE_SECRET)');
  for (const key of keys) {
    const res = await fetch(`${workerUrl}/purge-object`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Purge-Secret': secret },
      body: JSON.stringify({ bucket: 'dm-media', key }),
    });
    if (!res.ok) throw new Error(`R2 purge-object answered ${res.status}`);
    const { error } = await ctx.db.storage.from('dm-media').remove([key]);
    if (error && !/not.?found/i.test(error.message)) throw error;
  }
};

export const HANDLERS: Record<string, Handler> = {
  push,
  moderation,
  entitlements,
  broadcast,
  verification,
  erasure,
  media_gc: mediaGc,
};
