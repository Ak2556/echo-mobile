// On notifications insert, look up every device the recipient is signed in on
// and send via Expo's Push API. Wired by a Postgres trigger (see migration
// 20260524120000_notifications_push_fanout.sql) that POSTs the notification
// row to this function.
//
// POST /functions/v1/push-fanout
// Body: { user_id: uuid, type: string, target_id?: uuid, target_kind?: string,
//          actor_id?: uuid, preview?: string }
//
// The actor_id is used to load the actor's display_name so the title can read
// "Alice reacted with 🤯" instead of just "New reaction".

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { dmPushBody } from './copy.ts';
import { pruneDeadTokens, sendToExpo, tokensByUser } from '../_shared/expoPush.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Shared with the app so the channel/category ids can never drift apart: the
// client registers exactly what this stamps. See lib/notifications/routing.ts.
import {
  DAILY_PUSH_CAP,
  allowsKind,
  bypassesDailyCap,
  categoryForKind,
  channelForKind,
  priorityForKind,
} from '../../../lib/notifications/routing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface Body {
  user_id: string;
  type: string;
  target_id?: string;
  target_kind?: string;
  actor_id?: string;
  preview?: string;
}

const REACTION_EMOJI: Record<string, string> = {
  mind_blown: '🤯',
  taking_notes: '📝',
  agree: '💯',
  disagree: '🤔',
};

const PUSH_FANOUT_SECRET = Deno.env.get('PUSH_FANOUT_SECRET') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Only the DB trigger (which passes the shared secret) may call this function.
  const provided = req.headers.get('x-push-fanout-secret') ?? '';
  if (!PUSH_FANOUT_SECRET || !(await timingSafeEqual(provided, PUSH_FANOUT_SECRET))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!body.user_id) return new Response('user_id required', { status: 400 });

  // Load the recipient's devices, prefs and the actor name in parallel.
  // allSettled so a failed actor lookup doesn't abort the notification.
  const [recipientResult, tokensResult, actorResult, unreadResult] = await Promise.allSettled([
    supabase.from('profiles').select('notification_prefs').eq('id', body.user_id).maybeSingle(),
    // Every device the account is signed in on. This read only
    // profiles.push_token, one column per account, so each new sign-in
    // silenced every other device.
    tokensByUser(supabase, [body.user_id]),
    body.actor_id
      ? supabase.from('profiles').select('display_name, username').eq('id', body.actor_id).maybeSingle()
      : Promise.resolve({ data: null as { display_name?: string; username?: string } | null }),
    // Real badge number. This used to be a hardcoded 1, so an iOS home screen
    // read "1" whether the user had one notification waiting or forty, and it
    // never went back down. Served by idx_notifications_user_unread, a partial
    // index on exactly this predicate.
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', body.user_id)
      .is('read_at', null),
  ]);

  if (recipientResult.status === 'rejected' || tokensResult.status === 'rejected') {
    const reason = recipientResult.status === 'rejected' ? recipientResult.reason : (tokensResult as PromiseRejectedResult).reason;
    console.error('[push-fanout] recipient lookup failed:', reason);
    return new Response(JSON.stringify({ error: 'recipient lookup failed' }), { status: 500 });
  }

  const recipient = recipientResult.value.data;
  const tokens = tokensResult.value.get(body.user_id) ?? [];
  if (!recipient || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'no token' }), { status: 200 });
  }

  // The switches in Notification Preferences are enforced here, which is the
  // only place they can be: the decision has to hold for a device that is
  // asleep. The notification row is still written, so the in-app inbox stays
  // complete — turning a kind off silences the buzz, it does not erase the
  // record.
  if (!allowsKind(recipient.notification_prefs as Record<string, unknown> | null, body.type)) {
    return new Response(
      JSON.stringify({ skipped: 'muted by user preference', kind: body.type }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  // Daily delivery cap. The notification row is already written — the in-app
  // inbox is never capped — so nothing is lost here; it just isn't pushed.
  // Messages and moderation decisions bypass it: those are not engagement.
  if (!bypassesDailyCap(body.type)) {
    const { count: recentPushes } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', body.user_id)
      .not('type', 'in', '("dm","appeal_resolved","content_removed")')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((recentPushes ?? 0) > DAILY_PUSH_CAP) {
      return new Response(
        JSON.stringify({ skipped: 'daily cap', cap: DAILY_PUSH_CAP, seen: recentPushes }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  const actorData = actorResult.status === 'fulfilled' ? actorResult.value.data : null;
  const actorName = actorData?.display_name || actorData?.username || 'Someone';
  const title = titleFor(body.type, actorName, body.preview);
  const message = messageFor(body.type, actorName, body.preview);

  // data payload routes the tap. The client tap handler reads `kind` +
  // `target_id` from here and routes accordingly.
  const category = categoryForKind(body.type);
  const unread = unreadResult.status === 'fulfilled' ? (unreadResult.value.count ?? null) : null;

  const expoPayload = tokens.map((to) => ({
    to,
    title,
    body: message,
    sound: 'default',
    // Omitted rather than guessed when the count query failed — a wrong badge
    // that never clears is worse than no badge.
    ...(unread === null ? {} : { badge: unread }),
    // Android 8+ takes importance, sound and vibration from the channel, not
    // from this payload, so the channel is the only way to let someone mute
    // likes while keeping DMs. Unknown ids are safe: expo-notifications falls
    // back to its own channel rather than dropping the notification, so an
    // install running older JS still gets everything.
    channelId: channelForKind(body.type),
    // Draws the Reply button. Only set on kinds the client will actually act
    // on; a Reply button whose text goes nowhere is worse than no button.
    ...(category ? { categoryId: category } : {}),
    priority: priorityForKind(body.type),
    data: {
      kind: body.type,
      target_id: body.target_id ?? null,
      target_kind: body.target_kind ?? null,
      // Actor is the object of some notifications (e.g. follow has no target_id
      // — the tap should open the follower's profile).
      actor_id: body.actor_id ?? null,
    },
  }));

  // One ticket per device, each with its own status: HTTP 200 from Expo says
  // only that the request was accepted. From 2026-08-11 no FCM credential was
  // assigned, every ticket said InvalidCredentials inside a 200, and the push
  // stack was dead for weeks while reporting success. See _shared/expoTickets.
  const outcome = await sendToExpo(expoPayload);

  // Uninstalled apps and rotated installs. Without pruning, dead tokens stay on
  // file for ever and every later notification pays to deliver nothing.
  await pruneDeadTokens(supabase, outcome.dead);

  // Anything else is a real failure: a missing or expired FCM credential, a
  // payload Expo rejected, a sender-id mismatch. Answer 502 so it shows up in
  // the edge logs instead of hiding inside a 200.
  if (outcome.fatal.length > 0) {
    console.error(
      '[push-fanout] Expo rejected the push for', body.user_id, '—',
      outcome.fatal.map((f) => f.error).join('; '),
    );
    return new Response(JSON.stringify(outcome), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify(outcome), { status: 200, headers: { 'content-type': 'application/json' } });
});

// Pick a random variant so the same event never reads the same twice.
function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Voice: playful, a little cheeky, never corporate — a ping should feel like a
// friend narrating your day, not a system alert. Content-carrying types (dm,
// comment, mention, quote) keep the real text as the body; the title gets the
// personality.
function titleFor(t: string, actorName: string, preview?: string): string {
  switch (t) {
    case 'like': return pick([
      `${actorName} smashed the like button`,
      `Your echo is doing numbers rn`,
      `${actorName} agrees with your take`,
      `The dopamine hit you ordered 💌 (${actorName} liked your post)`,
      `${actorName} tapped that little heart. Taste: impeccable.`,
      `Warning: ${actorName} caught feelings for your echo`,
    ]);
    case 'comment': return pick([
      `${actorName} entered the chat`,
      `${actorName} has thoughts. Lots of them.`,
      `${actorName} slid a comment under your echo`,
      `Drama alert: ${actorName} replied`,
      `${actorName} couldn’t scroll past without commenting`,
    ]);
    case 'follow': return pick([
      `${actorName} followed you. Don't let the clout get to your head.`,
      `New follower: ${actorName}. The fan club grows.`,
      `${actorName} just signed up for your content. Bold move.`,
      `You're famous now. Wave to ${actorName}.`,
      `${actorName} is officially in your corner`,
    ]);
    case 'repost': return pick([
      `${actorName} liked your echo enough to steal it (nicely)`,
      `${actorName} gave your words a bigger stage`,
      `Going viral? ${actorName} just re-echoed you.`,
      `${actorName} put your echo on their page. Flattery.`,
    ]);
    case 'mention': return pick([
      `${actorName} name-dropped you`,
      `${actorName} pulled you into the mess`,
      `Your ears burning? ${actorName} tagged you.`,
      `${actorName} dragged you into the conversation`,
    ]);
    case 'friend_post': return pick([
      `Drop everything, ${actorName} just posted`,
      `${actorName} dropped a banger (probably)`,
      `Fresh tea from ${actorName} ☕️`,
      `${actorName} is active rn. Go look.`,
      `Catch up on ${actorName}'s latest`,
    ]);
    case 'friend_answer': return pick([
      `${actorName} answered today's question`,
      `${actorName} just answered`,
      `${actorName} took today's question`,
    ]);
    case 'dm': return pick([
      `${actorName} slid into your DMs`,
      `${actorName} sent a little something 🤫`,
      `Ping! ${actorName} wants your attention`,
      `Secret message from ${actorName}`,
    ]);
    case 'reaction': {
      const emoji = preview ? REACTION_EMOJI[preview] : '';
      if (!emoji) return `${actorName} reacted to your echo`;
      return pick([
        `${actorName} reacted ${emoji}`,
        `${emoji} incoming from ${actorName}`,
        `${actorName} hit your echo with that ${emoji} energy`,
      ]);
    }
    case 'bookmark': return pick([
      `${actorName} saved your echo. It's a keeper.`,
      `${actorName} filed your echo under "worth it"`,
      `${actorName} is keeping your echo forever. No pressure.`,
      `${actorName} bookmarked you. Museum-grade content.`,
    ]);
    case 'quote': return pick([
      `${actorName} took your echo and ran with it`,
      `${actorName} riffed on your echo`,
      `${actorName} built an empire on your words`,
      `${actorName} had a lot to say about your post`,
    ]);
    // The answer itself is the draw — show it, don't describe it.
    case 'friend_answer':
      return preview && preview.trim() ? preview.trim() : 'Go read it.';

    case 'daily_react': {
      const emoji = preview ? preview.trim().split(/\s+/)[0] : '';
      if (!emoji) return `${actorName} reacted to your answer`;
      return pick([
        `${emoji} ${actorName} felt something about your answer`,
        `${actorName} is judging your answer with ${emoji}`,
      ]);
    }
    case 'personal_nudge': return pick([
      `We miss you. Mostly.`,
      `Your daily dose of Echo`,
      `We’re literally waiting for you`,
      `Don't make us beg. Open the app.`,
      `psst... 🤫`,
    ]);
    case 'report_urgent': return 'Urgent report: act within 2 hours';
    case 'rules_reminder': return "A reminder of Echo's rules";
    default: return 'Echo';
  }
}

function messageFor(t: string, actorName: string, preview?: string): string {
  switch (t) {
    // A sealed DM arrives with no preview (fn_dm_push_notify); never a blank push.
    case 'dm':
      return dmPushBody(preview);
    // Content-carrying: show the real text.
    case 'comment':
    case 'mention':
    case 'quote':
    case 'friend_post':
      return (preview ?? '').slice(0, 140);
    case 'daily_react': {
      // Drop the leading emoji token; show the answer snippet as the body.
      const parts = (preview ?? '').trim().split(/\s+/);
      return parts.slice(1).join(' ').slice(0, 140);
    }
    case 'personal_nudge':
    case 'report_urgent':
      return (preview ?? '').slice(0, 140);
    case 'rules_reminder':
      return "What's not allowed, and what happens when the rules are broken. Tap to read.";
    // Title-only social pings get a little day-making flavor in the body.
    case 'like': return pick(['Good echo, apparently.', 'You cooked.', 'Certified good post.', 'The people have spoken.', '']);
    case 'follow': return pick(['Tap to see who.', 'Somebody has taste.', 'Go say hi.', 'Your reach is reaching.', '']);
    case 'repost': return pick(['Your words, wider reach.', 'Going places.', 'Spreading like good gossip.', '']);
    case 'reaction': return pick(['Tap to see the reaction.', 'Someone felt that.', 'That hit different.', '']);
    case 'bookmark': return pick(['Saved for a rainy day.', 'Filed under keepers.', 'Someone’s a fan.', '']);
    default:
      return '';
  }
}
