// On notifications insert, look up the recipient's push_token and send via
// Expo's Push API. Wired by a Postgres trigger (see migration
// 20260524120000_notifications_push_fanout.sql) that POSTs the notification
// row to this function.
//
// POST /functions/v1/push-fanout
// Body: { user_id: uuid, type: string, target_id?: uuid, target_kind?: string,
//          actor_id?: uuid, preview?: string }
//
// The actor_id is used to load the actor's display_name so the title can read
// "Alice reacted with 🤯" instead of just "New reaction".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (!PUSH_FANOUT_SECRET || provided !== PUSH_FANOUT_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!body.user_id) return new Response('user_id required', { status: 400 });

  // Load recipient token + actor name in parallel. allSettled so a failed
  // actor lookup doesn't abort the notification entirely.
  const [recipientResult, actorResult] = await Promise.allSettled([
    supabase.from('profiles').select('push_token').eq('id', body.user_id).maybeSingle(),
    body.actor_id
      ? supabase.from('profiles').select('display_name, username').eq('id', body.actor_id).maybeSingle()
      : Promise.resolve({ data: null as { display_name?: string; username?: string } | null }),
  ]);

  if (recipientResult.status === 'rejected') {
    console.error('[push-fanout] recipient lookup failed:', recipientResult.reason);
    return new Response(JSON.stringify({ error: 'recipient lookup failed' }), { status: 500 });
  }

  const recipient = recipientResult.value.data;
  if (!recipient?.push_token) {
    return new Response(JSON.stringify({ skipped: 'no token' }), { status: 200 });
  }

  const actorData = actorResult.status === 'fulfilled' ? actorResult.value.data : null;
  const actorName = actorData?.display_name || actorData?.username || 'Someone';
  const title = titleFor(body.type, actorName, body.preview);
  const message = messageFor(body.type, body.preview);

  // data payload routes the tap. The client tap handler reads `kind` +
  // `target_id` from here and routes accordingly.
  const expoPayload = [{
    to: recipient.push_token,
    title,
    body: message,
    sound: 'default',
    badge: 1,
    data: {
      kind: body.type,
      target_id: body.target_id ?? null,
      target_kind: body.target_kind ?? null,
      // Actor is the object of some notifications (e.g. follow has no target_id
      // — the tap should open the follower's profile).
      actor_id: body.actor_id ?? null,
    },
  }];

  const r = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(expoPayload),
  });
  const j = await r.json().catch(() => ({}));
  return new Response(JSON.stringify(j), { status: r.ok ? 200 : 502, headers: { 'content-type': 'application/json' } });
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
    case 'daily_react': {
      const emoji = preview ? preview.trim().split(/\s+/)[0] : '';
      if (!emoji) return `${actorName} reacted to your answer`;
      return pick([
        `${emoji} ${actorName} felt something about your answer`,
        `${actorName} is judging your answer with ${emoji}`,
      ]);
    }
    case 'personal_nudge': return 'Echo';
    default: return 'Echo';
  }
}

function messageFor(t: string, preview?: string): string {
  switch (t) {
    // Content-carrying: show the real text.
    case 'comment':
    case 'dm':
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
      return (preview ?? '').slice(0, 140);
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
