// Personalized fan-out — Stage 2c.
//
// Invoked hourly by pg_cron (see 20260718160000_personalized_fanout.sql) with
// the shared secret in x-cron-secret. For each CONSENTED user
// (profiles.personalized_notifications = true) whose learned best_hours include
// the current UTC hour — and who hasn't been nudged in ~a day — it inserts a
// notifications row whose content is matched to their top interest surface. The
// insert fires trg_notifications_push_fanout, which enqueues the push job.
//
//   supabase functions deploy personalized-fanout --no-verify-jwt
//   supabase secrets set PERSONALIZED_PUSH_SECRET=<random-string>
//   (+ the same value in Vault as personalized_push_secret — see the migration)

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// Occasion copy (birthday, Indian festivals) lives beside the routing table the
// push path already shares. See lib/notifications/triggerCopy.ts.
import { selectTrigger, copyForTrigger, istDateString } from '../../../lib/notifications/triggerCopy.ts';

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

/** A user claimed for a nudge this hour (claim_due_nudges). */
interface ClaimedRow {
  user_id: string;
  top_surface: string | null;
  date_of_birth: string | null;
}

/** At most this many users per run; the rest are due again next hour. */
const CLAIM_LIMIT = 500;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const provided = req.headers.get('x-cron-secret') ?? '';
  if (!CRON_SECRET || !(await timingSafeEqual(provided, CRON_SECRET))) return json({ error: 'unauthorized' }, 401);

  const nowHour = new Date().getUTCHours();

  // Claim, don't just select. claim_due_nudges stamps last_nudged_at on the
  // users it returns in one statement (skipping rows another run holds), so
  // overlapping runs partition the users between them instead of both nudging
  // them. This used to select, insert, then stamp each user separately: two
  // runs, or a crash between the steps, meant a second nudge. A claimed user
  // whose insert then fails misses one nudge, the right failure for a
  // marketing push. The query was also unbounded, so PostgREST's row cap
  // silently truncated it; the claim is bounded and ordered by who waited
  // longest.
  const { data, error } = await supabase.rpc('claim_due_nudges', {
    p_hour: nowHour,
    p_limit: CLAIM_LIMIT,
    p_min_gap_hours: MIN_HOURS_BETWEEN,
  });
  if (error) return json({ error: `claim failed: ${error.message}` }, 500);

  const rows = (data ?? []) as ClaimedRow[];
  if (rows.length === 0) return json({ sent: 0, hour: nowHour }, 200);

  // Which of these users already answered today's daily question — so a
  // 'daily'-surface nudge doesn't tell them to do something they've done.
  // Deliberately UTC: changing this to IST would change which question a
  // user sees, which is out of scope here — see istDateString's docstring.
  const today = new Date().toISOString().slice(0, 10);
  const { data: q } = await supabase
    .from('daily_questions').select('id').eq('active_date', today).maybeSingle();
  // Occasion triggers (birthday/festival) use the IST calendar date instead —
  // the audience is IST, and a UTC date is still "yesterday" until 05:30 IST.
  const occasionToday = istDateString();
  const answered = new Set<string>();
  if (q?.id) {
    const { data: ans } = await supabase
      .from('daily_answers').select('user_id')
      .eq('question_id', q.id)
      .in('user_id', rows.map(r => r.user_id));
    for (const a of (ans ?? []) as { user_id: string }[]) answered.add(a.user_id);
  }

  const notifications = rows.map((row) => {
    let surface = row.top_surface && SURFACE_COPY[row.top_surface] ? row.top_surface : 'chat';
    // If their interest is the daily question but they already answered, pivot.
    if (surface === 'daily' && answered.has(row.user_id)) surface = 'feed';

    // An occasion outranks the usual interest nudge: a birthday or festival is
    // rare enough to be worth the one notification this user will tolerate
    // today. On an ordinary day selectTrigger returns the surface and
    // copyForTrigger returns null, so the existing path runs untouched.
    const trigger = selectTrigger({ dateOfBirth: row.date_of_birth, today: occasionToday, surface });
    const occasionBody = copyForTrigger(trigger, pick);
    return {
      user_id: row.user_id,
      type: 'personal_nudge',
      actor_id: null, // system-generated (actor_id is nullable since the DSA migration)
      // Occasion nudges have no surface of their own; route them to the feed so
      // the tap still lands somewhere sensible.
      target_kind: trigger.kind === 'surface' ? surface : 'feed',
      preview: occasionBody ?? (SURFACE_COPY[surface] ?? SURFACE_COPY.chat)(),
    };
  });

  // One insert for the batch; each row's trigger enqueues its push job.
  const { error: insErr } = await supabase.from('notifications').insert(notifications);
  if (insErr) return json({ error: `insert failed: ${insErr.message}`, claimed: rows.length }, 500);

  return json({ sent: notifications.length, hour: nowHour }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
