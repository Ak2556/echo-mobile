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
//
// Every line has to be true for whoever receives it. These go to people who
// did nothing to trigger them, so a line can invite ("see what's new") but not
// report ("someone is waiting for your reply", "someone is stalking your
// profile"): that is invented social proof, which Play's policy on deceptive
// notifications forbids and which is the fastest way to get uninstalled. No
// health or therapy claims either (see the 2026-09-22 legal review).
const SURFACE_COPY: Record<string, () => string> = {
  daily: () => pick([
    "Today's question is up. What's your take?",
    "Two minutes, one question, your honest answer.",
    "Today's daily question is waiting. Answer, then see what everyone said.",
  ]),
  dm: () => pick([
    "Anyone you've been meaning to message? Now's a good time.",
    "Your chats are one tap away.",
    "Say hi to someone you haven't talked to in a while.",
  ]),
  feed: () => pick([
    "See what people have been posting on Echo.",
    "Catch up on your feed.",
    "Got a thought worth sharing? Post it.",
  ]),
  chat: () => pick([
    "Got a thought to untangle? Talk it through with Echo.",
    "Stuck on something? Ask Echo.",
    "Got a weird thought? Drop it in the chat.",
  ]),
  tools: () => pick([
    "A minute to move one thing forward. You got this.",
    "Your tools are a tap away.",
    "Tick one small thing off today.",
  ]),
  marketplace: () => pick([
    "Have something to sell? List it on Echo.",
    "Browse the marketplace.",
  ]),
  profile: () => pick([
    "See how your posts are doing.",
    "Check in on your profile and recent posts.",
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

  // Personalized nudges are on by default (20260930130000), so the first one a
  // person receives says how to switch them off. Anyone with an earlier
  // personal_nudge row has already been told.
  const { data: seen } = await supabase
    .from('notifications').select('user_id')
    .eq('type', 'personal_nudge')
    .in('user_id', rows.map(r => r.user_id));
  const toldBefore = new Set(((seen ?? []) as { user_id: string }[]).map(n => n.user_id));

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
      preview: withFirstNudgeNotice(
        occasionBody ?? (SURFACE_COPY[surface] ?? SURFACE_COPY.chat)(),
        !toldBefore.has(row.user_id),
      ),
    };
  });

  // One insert for the batch; each row's trigger enqueues its push job.
  const { error: insErr } = await supabase.from('notifications').insert(notifications);
  if (insErr) return json({ error: `insert failed: ${insErr.message}`, claimed: rows.length }, 500);

  return json({ sent: notifications.length, hour: nowHour }, 200);
});

/** The one-time "where to turn this off" line on a person's first nudge. */
export function withFirstNudgeNotice(body: string, first: boolean): string {
  return first ? `${body} Turn these off anytime in Settings → Privacy.` : body;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
