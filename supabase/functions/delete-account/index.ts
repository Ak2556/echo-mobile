// delete-account — erasure that actually reaches every store.
//
// WHY THIS EXISTS
// The `delete_account()` SQL function removes the user's rows and their
// auth.users record, then makes a best-effort pass at `storage.objects`. But
// Echo does not keep media in Supabase Storage — every avatar, post image, DM
// attachment, mini-app upload and marketplace photo lives in Cloudflare R2,
// which Postgres cannot reach. The result was that "delete my account" left
// every file the user ever uploaded in place, indefinitely.
//
// This function is the erasure entry point. Order matters:
//   1. Purge R2 first, while we still have a verified user id.
//   2. Then delete the database rows and the auth user.
//
// If step 1 fails we do NOT proceed, because deleting the account first would
// destroy the only record of which objects to purge. The caller gets a clear
// error and can retry; nothing is left half-deleted.
//
// Requires:
//   CLOUDFLARE_WORKER_URL  — base URL of the R2 worker
//   PURGE_SECRET           — shared secret, matches the worker's binding
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WORKER_URL = (Deno.env.get('CLOUDFLARE_WORKER_URL') ?? '').replace(/\/$/, '');
const PURGE_SECRET = Deno.env.get('PURGE_SECRET') ?? '';

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

  const userId = user.id;

  // ── 1. purge media from R2 ────────────────────────────────────────────────
  if (!WORKER_URL || !PURGE_SECRET) {
    console.error('[delete-account] purge is not configured; refusing to delete');
    return json({
      error: 'Account deletion is temporarily unavailable. Please contact support.',
    }, 503);
  }

  let purged: Record<string, number> | null = null;
  try {
    const res = await fetch(`${WORKER_URL}/purge-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Purge-Secret': PURGE_SECRET },
      body: JSON.stringify({ user_id: userId }),
    });
    const payload = await res.json().catch(() => ({}));
    // 207 means some buckets failed — treat that as a failure too, because a
    // partial purge is exactly the state we are trying to eliminate.
    if (!res.ok || res.status === 207) {
      console.error('[delete-account] R2 purge failed', res.status, payload);
      return json({
        error: 'Could not remove your uploaded files. Nothing was deleted; please try again.',
      }, 502);
    }
    purged = payload?.deleted ?? null;
  } catch (err) {
    console.error('[delete-account] R2 purge threw', err);
    return json({
      error: 'Could not remove your uploaded files. Nothing was deleted; please try again.',
    }, 502);
  }

  // ── 2. delete the account rows ────────────────────────────────────────────
  // Run as the user so `delete_account()` reads the right auth.uid().
  const { error: rpcErr } = await asUser.rpc('delete_account');
  if (rpcErr) {
    // The media is already gone. Escalate with the service role so we do not
    // leave an account whose files have been purged.
    console.error('[delete-account] RPC failed after purge; escalating', rpcErr);
    if (SERVICE_ROLE_KEY) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { error: adminErr } = await admin.auth.admin.deleteUser(userId);
      if (adminErr) {
        console.error('[delete-account] admin delete also failed', adminErr);
        return json({ error: 'Account deletion failed. Please contact support.' }, 500);
      }
    } else {
      return json({ error: 'Account deletion failed. Please contact support.' }, 500);
    }
  }

  console.log('[delete-account] deleted', userId, 'purged', JSON.stringify(purged));
  return json({ ok: true, purged });
});
