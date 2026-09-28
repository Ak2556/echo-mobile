// delete-account — erasure that reaches every store, and finishes.
//
// Echo keeps media in Cloudflare R2 (and, from before that move, in Supabase
// Storage), which Postgres cannot reach, so deleting the account rows alone
// would leave every file the user uploaded in place.
//
// This endpoint records the request and queues an 'erasure' job in one
// transaction (request_erasure), then runs the erasure inline (erasure.ts).
// Normally that finishes before it answers: 200, the account is gone. If a
// step fails, the queued job resumes from the step it reached, with retries
// and a dead-letter queue, and the answer is 202: the deletion is accepted
// and will complete. It used to be one request that, failing after the
// purge, could only say "contact support".
//
// Requires:
//   CLOUDFLARE_WORKER_URL  — base URL of the R2 worker
//   PURGE_SECRET           — shared secret, matches the worker's binding
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { runErasure } from './erasure.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  // Identify the caller from their own token. We never take a user id from the
  // request body — that would let anyone delete anyone.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Durable first: once this returns, the deletion will complete whatever
  // happens to this request.
  const { error: reqErr } = await admin.rpc('request_erasure', { p_user: user.id });
  if (reqErr) {
    console.error('[delete-account] could not record the request', reqErr);
    return json({ error: 'Account deletion is temporarily unavailable. Nothing was deleted; please try again.' }, 503);
  }

  try {
    await runErasure(admin, user.id);
    return json({ ok: true });
  } catch (err) {
    console.error('[delete-account] erasure deferred to the job queue', user.id, err);
    return json({ ok: true, pending: true, message: 'Your account is being deleted. This can take a few minutes.' }, 202);
  }
});
