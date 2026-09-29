// Deliver one notification to every device the recipient is signed in on.
//
// POST /functions/v1/push-fanout
// Body: { user_id: uuid, type: string, target_id?: uuid, target_kind?: string,
//          actor_id?: uuid, preview?: string }
//
// Since 20260928110000 the notifications trigger enqueues a 'push' job and the
// worker delivers it (with retries and a dead-letter queue) through the same
// deliverNotification. This endpoint stays so a database still on the old
// trigger keeps delivering during the rollout, and for manual sends.

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { deliverNotification, type PushNotification } from './deliver.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const PUSH_FANOUT_SECRET = Deno.env.get('PUSH_FANOUT_SECRET') ?? '';

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Only the DB trigger (which passes the shared secret) may call this function.
  const provided = req.headers.get('x-push-fanout-secret') ?? '';
  if (!PUSH_FANOUT_SECRET || !(await timingSafeEqual(provided, PUSH_FANOUT_SECRET))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: PushNotification;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!body.user_id) return new Response('user_id required', { status: 400 });

  let result;
  try {
    result = await deliverNotification(supabase, body);
  } catch (e) {
    console.error('[push-fanout] recipient lookup failed:', e);
    return json({ error: 'recipient lookup failed' }, 500);
  }
  if ('skipped' in result) return json(result, 200);

  // A ticket error other than an uninstalled device is a real failure: a
  // missing or expired FCM credential, a payload Expo rejected, a sender-id
  // mismatch. 502 makes it show in the edge logs instead of hiding in a 200.
  const { outcome } = result;
  if (outcome.fatal.length > 0) {
    console.error('[push-fanout] Expo rejected the push for', body.user_id, '—', outcome.fatal.map((f) => f.error).join('; '));
    return json(outcome, 502);
  }
  return json(outcome, 200);
});
