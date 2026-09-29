// worker — drains the job queues (pgmq) that the database fills.
//
// A transaction that needs work done (a notification to push, a post to judge)
// enqueues a job with public.jobs_enqueue and, after commit, pg_net "kicks"
// this function with the queue name. The kick returns 202 at once; the drain
// runs in the background, claiming messages with a visibility timeout:
//
//   handler returns  -> jobs_ack    (deleted)
//   handler throws   -> jobs_retry  (invisible for 30s, 60s, 120s ... then retried)
//   still failing    -> jobs_dead   (archived, copied to the 'dlq' queue)
//
// A crash mid-message loses nothing: its visibility lapses and the sweeper
// (pg_cron, every minute) kicks the queue again. cron_health reports the
// dead-letter depth and any message left waiting, so a failure is visible,
// never silent.
//
// Deploy with --no-verify-jwt (see config.toml). The caller is the database,
// which proves itself with x-worker-secret: WORKER_SECRET here, and the same
// value in Vault as `worker_secret`.

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { HANDLERS } from './handlers.ts';
import { BATCH, DRAIN_BUDGET_MS, VISIBILITY_SECONDS, backoffSeconds, onFailure } from './policy.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const SECRET = Deno.env.get('WORKER_SECRET') ?? '';

interface Claimed {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  message: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!SECRET || !(await timingSafeEqual(req.headers.get('x-worker-secret') ?? '', SECRET))) {
    return new Response(null, { status: 401 });
  }
  let queue = '';
  try {
    queue = String((await req.json())?.queue ?? '');
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!HANDLERS[queue]) return new Response(null, { status: 400 });

  EdgeRuntime.waitUntil(drain(queue));
  return new Response(null, { status: 202 });
});

async function drain(queue: string): Promise<void> {
  const handler = HANDLERS[queue];
  const started = Date.now();
  while (Date.now() - started < DRAIN_BUDGET_MS) {
    const { data, error } = await db.rpc('jobs_claim', { p_queue: queue, p_n: BATCH, p_vt: VISIBILITY_SECONDS });
    if (error) {
      console.error(`[worker:${queue}] claim failed:`, error.message);
      return;
    }
    const batch = (data ?? []) as Claimed[];
    if (batch.length === 0) return;

    await Promise.all(batch.map(async (m) => {
      const report = async (err: string) => {
        const { error: e } = await db.rpc('jobs_report', { p_queue: queue, p_msg: m.message, p_error: err });
        if (e) console.error(`[worker:${queue}] report failed:`, e.message, '—', err);
      };
      try {
        await handler(m.message, { db, enqueuedAt: m.enqueued_at, report });
        await settle(queue, 'jobs_ack', { p_queue: queue, p_id: m.msg_id });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        if (onFailure(m.read_ct) === 'dead') {
          console.error(`[worker:${queue}] dead-lettering ${m.msg_id} after ${m.read_ct} attempts:`, err);
          await settle(queue, 'jobs_dead', { p_queue: queue, p_id: m.msg_id, p_msg: m.message, p_error: err });
        } else {
          console.warn(`[worker:${queue}] attempt ${m.read_ct} of ${m.msg_id} failed:`, err);
          await settle(queue, 'jobs_retry', { p_queue: queue, p_id: m.msg_id, p_delay: backoffSeconds(m.read_ct) });
        }
      }
    }));
  }
}

/**
 * Record a message's outcome. If this fails the message is not lost: its
 * visibility lapses and it is claimed again, which every handler tolerates.
 */
async function settle(queue: string, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await db.rpc(fn, args);
  if (error) console.error(`[worker:${queue}] ${fn} failed:`, error.message);
}
