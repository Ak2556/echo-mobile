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
      `${actorName} liked your echo`,
      `${actorName} smashed the like on your echo`,
      `${actorName} approves of your echo 🫶`,
      `Your echo just won ${actorName} over`,
    ]);
    case 'comment': return pick([
      `${actorName} had something to say`,
      `${actorName} dropped a comment`,
      `${actorName} replied to your echo`,
    ]);
    case 'follow': return pick([
      `${actorName} followed you. Great taste.`,
      `New follower: ${actorName}. The fan club grows.`,
      `${actorName} hit follow — wave hello?`,
    ]);
    case 'repost': return pick([
      `${actorName} re-echoed you. Spreading the word.`,
      `${actorName} gave your echo a bigger stage`,
      `${actorName} re-echoed your post`,
    ]);
    case 'mention': return pick([
      `${actorName} name-dropped you`,
      `${actorName} pulled you into it`,
      `${actorName} mentioned you`,
    ]);
    case 'dm': return pick([
      `${actorName} messaged you`,
      `New message from ${actorName}`,
      `${actorName} slid into your DMs`,
    ]);
    case 'reaction': {
      const emoji = preview ? REACTION_EMOJI[preview] : '';
      if (!emoji) return `${actorName} reacted to your echo`;
      return pick([
        `${actorName} reacted ${emoji}`,
        `${emoji} from ${actorName} on your echo`,
        `${actorName} hit your echo with ${emoji}`,
      ]);
    }
    case 'bookmark': return pick([
      `${actorName} saved your echo. It's a keeper.`,
      `${actorName} bookmarked your echo for later. Fancy.`,
      `${actorName} filed your echo under "worth it"`,
    ]);
    case 'quote': return pick([
      `${actorName} quoted you`,
      `${actorName} built on your echo`,
      `${actorName} quoted your echo`,
    ]);
    case 'daily_react': {
      // preview is "<emoji>  <answer snippet>" — lead the title with the emoji.
      const emoji = preview ? preview.trim().split(/\s+/)[0] : '';
      if (!emoji) return `${actorName} reacted to your answer`;
      return pick([
        `${actorName} reacted ${emoji} to your answer`,
        `${emoji} ${actorName} felt something about your answer`,
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
      return (preview ?? '').slice(0, 140);
    case 'daily_react': {
      // Drop the leading emoji token; show the answer snippet as the body.
      const parts = (preview ?? '').trim().split(/\s+/);
      return parts.slice(1).join(' ').slice(0, 140);
    }
    case 'personal_nudge':
      return (preview ?? '').slice(0, 140);
    // Title-only social pings get a little day-making flavor in the body.
    case 'like': return pick(['Good echo, apparently.', 'You cooked.', '']);
    case 'follow': return pick(['Tap to see who.', 'Somebody has taste.', '']);
    case 'repost': return pick(['Your words, wider reach.', '']);
    case 'reaction': return pick(['Tap to see the reaction.', '']);
    case 'bookmark': return pick(['Saved for a rainy day.', '']);
    default:
      return '';
  }
}
