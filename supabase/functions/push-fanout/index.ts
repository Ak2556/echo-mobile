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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
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

function titleFor(t: string, actorName: string, preview?: string): string {
  switch (t) {
    case 'like': return `${actorName} liked your echo`;
    case 'comment': return `${actorName} commented`;
    case 'follow': return `${actorName} followed you`;
    case 'repost': return `${actorName} re-echoed your post`;
    case 'mention': return `${actorName} mentioned you`;
    case 'dm': return `${actorName} sent a message`;
    case 'reaction': {
      const emoji = preview ? REACTION_EMOJI[preview] : '';
      return emoji ? `${actorName} reacted with ${emoji}` : `${actorName} reacted to your echo`;
    }
    case 'bookmark': return `${actorName} saved your echo`;
    case 'quote': return `${actorName} quoted your echo`;
    default: return 'Echo';
  }
}

function messageFor(t: string, preview?: string): string {
  switch (t) {
    case 'comment':
    case 'dm':
    case 'mention':
    case 'quote':
      return (preview ?? '').slice(0, 140);
    default:
      return '';
  }
}
