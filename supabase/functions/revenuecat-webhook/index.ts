// RevenueCat webhook: verify it, record it, and queue an entitlement sync.
//
// The event is treated as a nudge, not as state. ingest_revenuecat_event
// records it (a redelivery is a no-op) and enqueues an 'entitlements' job per
// Echo user it names, in one transaction. The worker then reads the resolved
// subscriber from RevenueCat and writes user_entitlements, the table the rate
// limiter reads (see entitlements.ts for why not the event itself).
//
// The previous version wrote profiles.premium_entitlement, which nothing read,
// and inserted its dedupe row before processing, so a failed update was
// acknowledged as a duplicate on RevenueCat's retry and lost.
//
// Secrets: REVENUECAT_WEBHOOK_SECRET is the HMAC signing secret (enable HMAC
// signing on the webhook integration); REVENUECAT_SECRET_KEY is a v1 secret
// API key, read by the worker for the sync.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { verifyRevenueCatSignature } from './signature.ts';
import { usersInEvent } from './entitlements.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const check = await verifyRevenueCatSignature(
    req.headers.get('x-revenuecat-webhook-signature'),
    raw,
    SECRET,
    Math.floor(Date.now() / 1000),
  );
  if (!check.ok) {
    console.warn('[revenuecat-webhook] rejected:', check.reason);
    return new Response('Unauthorized', { status: 401 });
  }

  let event: Record<string, unknown> | undefined;
  try {
    event = JSON.parse(raw)?.event;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (!event || typeof event.id !== 'string') return new Response('No event', { status: 400 });

  const { error } = await admin.rpc('ingest_revenuecat_event', { p_event: event, p_users: usersInEvent(event) });
  if (error) {
    // Nothing was recorded (one transaction), so RevenueCat's retry starts clean.
    console.error('[revenuecat-webhook] ingest failed:', error.message);
    return new Response('Retry', { status: 500 });
  }
  return new Response('OK', { status: 200 });
});
