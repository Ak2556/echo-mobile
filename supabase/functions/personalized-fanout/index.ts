// Personalized fan-out — Stage 2c.
//
// Invoked hourly by pg_cron (see 20260718160000_personalized_fanout.sql) with
// the shared secret in x-cron-secret. For each CONSENTED user
// (profiles.personalized_notifications = true) whose learned best_hours include
// the current UTC hour — and who hasn't been nudged in ~a day — it inserts a
// notifications row whose content is matched to their top interest surface. The
// insert fires trg_notifications_push_fanout → push-fanout → the actual push.
//
//   supabase functions deploy personalized-fanout --no-verify-jwt
//   supabase secrets set PERSONALIZED_PUSH_SECRET=<random-string>
//   (+ the same value in Vault as personalized_push_secret — see the migration)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('PERSONALIZED_PUSH_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Only nudge again after this many hours — server-side frequency cap.
const MIN_HOURS_BETWEEN = 20;

// Interest-matched copy, keyed by the user's top surface.
const SURFACE_COPY: Record<string, string> = {
  daily: "Today's question is live — two minutes to add your take.",
  dm: 'Pick a conversation back up — someone may be waiting on you.',
  feed: 'Fresh thinking landed in your feed since you last looked.',
  chat: "Want to think something through? Echo's ready when you are.",
  tools: 'A minute to move one thing forward? Your tools are a tap away.',
  marketplace: 'New listings dropped in the marketplace — worth a look?',
  profile: 'See who engaged with your work today.',
};

interface ProfileRow {
  user_id: string;
  best_hours: number[] | null;
  top_surface: string | null;
  last_nudged_at: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || provided !== CRON_SECRET) return json({ error: 'unauthorized' }, 401);

  const nowHour = new Date().getUTCHours();
  const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN * 3_600_000).toISOString();

  // Consented users due at this hour and outside the frequency cap. The join to
  // profiles enforces consent (personalized_notifications = true) and a token.
  const { data, error } = await supabase
    .from('notification_profiles')
    .select('user_id, best_hours, top_surface, last_nudged_at, profiles!inner(personalized_notifications, push_token)')
    .contains('best_hours', [nowHour])
    .or(`last_nudged_at.is.null,last_nudged_at.lt.${cutoff}`)
    .eq('profiles.personalized_notifications', true)
    .not('profiles.push_token', 'is', null);

  if (error) return json({ error: `lookup failed: ${error.message}` }, 500);

  const rows = (data ?? []) as unknown as ProfileRow[];
  if (rows.length === 0) return json({ sent: 0, hour: nowHour }, 200);

  // Which of these users already answered today's daily question — so a
  // 'daily'-surface nudge doesn't tell them to do something they've done.
  const today = new Date().toISOString().slice(0, 10);
  const { data: q } = await supabase
    .from('daily_questions').select('id').eq('active_date', today).maybeSingle();
  const answered = new Set<string>();
  if (q?.id) {
    const { data: ans } = await supabase
      .from('daily_answers').select('user_id')
      .eq('question_id', q.id)
      .in('user_id', rows.map(r => r.user_id));
    for (const a of (ans ?? []) as { user_id: string }[]) answered.add(a.user_id);
  }

  let sent = 0;
  for (const row of rows) {
    let surface = row.top_surface && SURFACE_COPY[row.top_surface] ? row.top_surface : 'chat';
    // If their interest is the daily question but they already answered, pivot.
    if (surface === 'daily' && answered.has(row.user_id)) surface = 'feed';
    const body = SURFACE_COPY[surface] ?? SURFACE_COPY.chat;

    const { error: insErr } = await supabase.from('notifications').insert({
      user_id: row.user_id,
      type: 'personal_nudge',
      actor_id: null,          // system-generated (actor_id is nullable since the DSA migration)
      target_kind: surface,    // push-fanout forwards this so the tap routes to the right surface
      preview: body,
    });
    if (insErr) continue;

    await supabase.from('notification_profiles')
      .update({ last_nudged_at: new Date().toISOString() })
      .eq('user_id', row.user_id);
    sent += 1;
  }

  return json({ sent, considered: rows.length, hour: nowHour }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
