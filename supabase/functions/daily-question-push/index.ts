// Daily-question push — the retention loop's trigger.
//
// The pg_cron job now claims the day's broadcast directly in SQL
// (claim_daily_broadcast, 20260928140000), which records that today's
// question was sent and enqueues 'broadcast' jobs of up to 100 users each for
// the worker. This endpoint remains for a manual send and calls the same
// claim, so however it is triggered, and however often, a question goes out
// once.
//
// It used to page every token and POST to Expo here, with nothing recording
// that the day had been sent: a re-run pushed everyone twice. It also counted
// a chunk as sent on HTTP 200, the same misreading push-fanout once had, when
// each ticket carries its own error.
//
//   supabase functions deploy daily-question-push   (verify_jwt = false, config.toml)
//   supabase secrets set DAILY_PUSH_SECRET=<random-string>

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const CRON_SECRET = Deno.env.get('DAILY_PUSH_SECRET') ?? '';

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Refuse if no secret is configured at all, so a misconfigured deploy can't
  // be triggered anonymously.
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || !(await timingSafeEqual(provided, CRON_SECRET))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data, error } = await db.rpc('claim_daily_broadcast');
  if (error) return json({ error: error.message }, 500);
  // 0 batches: already sent today, or nobody has a device registered.
  return json({ batches: data }, 200);
});
