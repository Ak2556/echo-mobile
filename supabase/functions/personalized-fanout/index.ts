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
// Occasion copy (birthday, Indian festivals) lives beside the routing table the
// push path already shares. See lib/notifications/triggerCopy.ts.
import { selectTrigger, copyForTrigger } from '../../../lib/notifications/triggerCopy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('PERSONALIZED_PUSH_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// Only nudge again after this many hours — server-side frequency cap.
const MIN_HOURS_BETWEEN = 20;

// Pick a random variant so the same event never reads the same twice.
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Interest-matched copy, keyed by the user's top surface.
const SURFACE_COPY: Record<string, () => string> = {
  daily: () => pick([
    "Today's question is live. Prove you have the best take.",
    "Everyone is wrong today. Come correct them.",
    "The daily question is waiting for your brilliant, unfiltered opinion.",
  ]),
  dm: () => pick([
    "You left them on read, didn't you?",
    "Someone is literally waiting for your reply right now.",
    "Your DMs are getting dusty. Go say hi.",
  ]),
  feed: () => pick([
    "Your timeline is getting spicy today. Don't miss out.",
    "People are posting things you're probably going to disagree with.",
    "Fresh drama (or profound thoughts) just landed in your feed.",
  ]),
  chat: () => pick([
    "Our AI is bored. Come talk to it.",
    "Need a late-night therapy session? Echo is ready.",
    "Got a weird thought? Drop it in the chat.",
  ]),
  tools: () => pick([
    "Your productivity is begging for attention.",
    "A minute to move one thing forward. You got this.",
    "Stop procrastinating. Your tools are a tap away.",
  ]),
  marketplace: () => pick([
    "Someone is probably selling exactly what you need.",
    "New listings dropped. Time to impulse buy.",
    "Window shopping is free. Check out the marketplace.",
  ]),
  profile: () => pick([
    "Someone is stalking your profile. Go see who.",
    "Your clout is rising. See who engaged with your work today.",
    "You're kind of a big deal today.",
  ]),
};

interface ProfileRow {
  user_id: string;
  best_hours: number[] | null;
  top_surface: string | null;
  last_nudged_at: string | null;
  // PostgREST returns an embedded to-one relation as an object, but types it
  // loosely enough that an array shows up in some client versions. Normalised
  // by profileOf() rather than trusted either way.
  profiles?: EmbeddedProfile | EmbeddedProfile[] | null;
}

interface EmbeddedProfile {
  personalized_notifications?: boolean | null;
  push_token?: string | null;
  date_of_birth?: string | null;
}

function profileOf(row: ProfileRow): EmbeddedProfile | null {
  const p = row.profiles;
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
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
    .select('user_id, best_hours, top_surface, last_nudged_at, profiles!inner(personalized_notifications, push_token, date_of_birth)')
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

    // An occasion outranks the usual interest nudge: a birthday or festival is
    // rare enough to be worth the one notification this user will tolerate
    // today. On an ordinary day selectTrigger returns the surface and
    // copyForTrigger returns null, so the existing path runs untouched.
    const trigger = selectTrigger({
      dateOfBirth: profileOf(row)?.date_of_birth ?? null,
      today,
      surface,
    });
    const occasionBody = copyForTrigger(trigger, pick);
    const body = occasionBody ?? (SURFACE_COPY[surface] ?? SURFACE_COPY.chat)();

    const { error: insErr } = await supabase.from('notifications').insert({
      user_id: row.user_id,
      type: 'personal_nudge',
      actor_id: null,          // system-generated (actor_id is nullable since the DSA migration)
      // Occasion nudges have no surface of their own; route them to the feed so
      // the tap still lands somewhere sensible.
      target_kind: trigger.kind === 'surface' ? surface : 'feed',
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
