// Daily-question push — the retention loop's trigger.
//
// Unlike push-fanout (one recipient, fired by a notifications-insert trigger),
// this enumerates EVERY profile with a push token and sends today's daily
// question in batches via Expo's Push API (max 100 messages/request).
//
// Invoked once a day by pg_cron (see migration
// 20260529040000_daily_question_push_cron.sql), which POSTs here with the
// shared secret in the `x-cron-secret` header. Deploy with --no-verify-jwt so
// the scheduler can reach it without a user JWT; the secret is the gate.
//
//   supabase functions deploy daily-question-push --no-verify-jwt
//   supabase secrets set DAILY_PUSH_SECRET=<random-string>
//
// The same secret must also live in Vault as `daily_push_secret` so the cron
// SQL can read it (the migration explains this).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('DAILY_PUSH_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PAGE_SIZE = 1000; // profile rows per fetch
const PUSH_CHUNK = 100; // Expo's documented max messages per request

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { kind: 'daily_question'; target_id: string | null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Gate: constant header check. Refuse if no secret is configured at all so a
  // misconfigured deploy can't be triggered anonymously.
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Today's question — same selection the app uses (active_date = today, UTC).
  const today = new Date().toISOString().slice(0, 10);
  const { data: question, error: qErr } = await supabase
    .from('daily_questions')
    .select('id, question')
    .eq('active_date', today)
    .maybeSingle();

  if (qErr) return json({ error: `question lookup failed: ${qErr.message}` }, 500);
  if (!question) return json({ skipped: 'no question scheduled for today', today }, 200);

  // Page through every profile that has a push token.
  const tokens = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('push_token')
      .not('push_token', 'is', null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) return json({ error: `token fetch failed: ${error.message}` }, 500);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const t = (row as { push_token: string | null }).push_token;
      // Expo tokens look like ExponentPushToken[...] or ExpoPushToken[...].
      if (t && /^Expo(nent)?PushToken\[.+\]$/.test(t)) tokens.add(t);
    }
    if (data.length < PAGE_SIZE) break;
  }

  if (tokens.size === 0) return json({ skipped: 'no push tokens', today }, 200);

  const title = "Today's question";
  const body = truncate(question.question, 150);
  const messages: ExpoMessage[] = [...tokens].map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    data: { kind: 'daily_question', target_id: question.id },
  }));

  // Fan out in chunks; tolerate partial failures so one bad chunk doesn't sink
  // the whole run.
  let sent = 0;
  const errors: string[] = [];
  for (const chunk of chunked(messages, PUSH_CHUNK)) {
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (r.ok) sent += chunk.length;
      else errors.push(`chunk ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      errors.push(`chunk threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return json({ ok: true, today, question_id: question.id, tokens: tokens.size, sent, errors }, 200);
});

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
