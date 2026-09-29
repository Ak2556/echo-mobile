// Create (or return) the Razorpay order that pays for one ad.
//
// POST { ad_id: uuid, budget_inr: integer }  ->  { id, amount, currency }
//
// The server binds the order to the ad and records the price, with the service
// role, because guard_client_writes stops a client setting either (otherwise
// one rupee could buy any ad). The client used to choose the order amount and
// then write the order id itself; the guard discarded it, so the webhook could
// never find the ad a payment was for.
//
// Idempotent per ad: an ad that already has an order gets the same order back,
// so a retried request can never create a second charge.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_BUDGET_INR = 100;
const MAX_BUDGET_INR = 100_000;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface AdRow {
  id: string;
  advertiser_id: string;
  payment_status: string;
  razorpay_order_id: string | null;
  budget_amount: number;
}

const orderOf = (ad: AdRow) => ({ id: ad.razorpay_order_id, amount: Math.round(Number(ad.budget_amount) * 100), currency: 'INR' });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const asUser = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  let adId = '';
  let budget = NaN;
  try {
    const body = await req.json();
    adId = String(body?.ad_id ?? '');
    budget = Number(body?.budget_inr);
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }
  if (!adId) return json({ error: 'ad_id is required' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });
  const loadAd = async () => {
    const { data } = await admin
      .from('ads')
      .select('id, advertiser_id, payment_status, razorpay_order_id, budget_amount')
      .eq('id', adId)
      .maybeSingle();
    return data as AdRow | null;
  };

  const ad = await loadAd();
  if (!ad || ad.advertiser_id !== user.id) return json({ error: 'Ad not found' }, 404);
  if (ad.payment_status !== 'pending') return json({ error: 'This ad is already paid for' }, 409);
  if (ad.razorpay_order_id) return json(orderOf(ad));

  if (!Number.isInteger(budget) || budget < MIN_BUDGET_INR || budget > MAX_BUDGET_INR) {
    return json({ error: `Budget must be a whole number of rupees from ${MIN_BUDGET_INR} to ${MAX_BUDGET_INR}` }, 400);
  }

  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json({ error: 'Payments are not configured' }, 503);

  const rp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: budget * 100, currency: 'INR', receipt: ad.id, notes: { ad_id: ad.id } }),
  });
  const order = await rp.json().catch(() => ({}));
  if (!rp.ok || !order?.id) return json({ error: order?.error?.description ?? 'Could not create the order' }, 502);

  // First writer wins. A concurrent request that bound its own order first is
  // answered with that one, and this order is left unpaid (Razorpay expires it).
  const { data: bound } = await admin
    .from('ads')
    .update({ razorpay_order_id: order.id, budget_amount: budget })
    .eq('id', ad.id)
    .eq('payment_status', 'pending')
    .is('razorpay_order_id', null)
    .select('id');
  if (!bound?.length) {
    const current = await loadAd();
    return current?.razorpay_order_id ? json(orderOf(current)) : json({ error: 'Could not bind the order' }, 409);
  }
  return json({ id: order.id, amount: budget * 100, currency: 'INR' });
});
