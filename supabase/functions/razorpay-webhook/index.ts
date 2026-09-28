// Razorpay webhook: verify it and settle the ad it pays for.
//
// Settlement is one guarded transition in settle_ad_payment: the ad must be
// pending, bound to this order, and priced at exactly the amount captured.
// Each Razorpay event id is recorded once, so a redelivery does nothing, and
// a replay can no longer re-activate an ad after a refund or a takedown.
//
// A payment that matches no pending ad (money taken, nothing to activate) is
// written to the dead-letter queue, where cron_health reports it. It used to
// update zero rows and answer 200: the customer paid and nobody knew.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { hmacSha256Hex } from '../_shared/hmac.ts';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';

const SETTLING_EVENTS = new Set(['payment.captured', 'order.paid']);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('x-razorpay-signature');
  if (!signature || !SECRET) return new Response('Unauthorized', { status: 401 });

  const raw = await req.text();
  if (!(await timingSafeEqual(await hmacSha256Hex(SECRET, raw), signature))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (!event.event || !SETTLING_EVENTS.has(event.event)) return new Response('Ignored', { status: 200 });

  // Razorpay's id for this delivery; the payment id stands in if it is absent.
  const eventId = req.headers.get('x-razorpay-event-id')
    ?? `${event.event}:${event.payload?.payment?.entity?.id ?? ''}`;

  const { data, error } = await admin.rpc('settle_ad_payment', { p_event_id: eventId, p_payload: event });
  if (error) {
    // Nothing was recorded (one transaction), so Razorpay's retry starts clean.
    console.error('[razorpay-webhook] settle failed:', error.message);
    return new Response('Retry', { status: 500 });
  }
  if (data === 'unmatched') console.error('[razorpay-webhook] payment matched no pending ad; see the dlq', eventId);
  return new Response(String(data), { status: 200 });
});
