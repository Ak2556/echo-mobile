// On notifications insert, look up the recipient's push_token and send via
// Expo's Push API. Wired by a Postgres trigger that POSTs to this function
// or by a server-side hook on insert.
//
// POST /functions/v1/push-fanout
// Body: { user_id: uuid, type: string, preview?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

interface Body { user_id: string; type: string; preview?: string }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body: Body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  if (!body.user_id) return new Response('user_id required', { status: 400 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token, display_name, username')
    .eq('id', body.user_id)
    .maybeSingle();

  if (!profile?.push_token) return new Response(JSON.stringify({ skipped: 'no token' }), { status: 200 });

  const title = titleFor(body.type);
  const message = body.preview || messageFor(body.type);

  const expoPayload = [{
    to: profile.push_token,
    title,
    body: message,
    sound: 'default',
    data: { type: body.type },
  }];

  const r = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(expoPayload),
  });
  const j = await r.json().catch(() => ({}));
  return new Response(JSON.stringify(j), { status: r.ok ? 200 : 502, headers: { 'content-type': 'application/json' } });
});

function titleFor(t: string): string {
  switch (t) {
    case 'like': return 'New like';
    case 'comment': return 'New reply';
    case 'follow': return 'New follower';
    case 'repost': return 'New re-echo';
    case 'mention': return 'You were mentioned';
    case 'dm': return 'New message';
    default: return 'Echo';
  }
}
function messageFor(t: string): string {
  switch (t) {
    case 'like': return 'Someone liked your echo';
    case 'comment': return 'Someone commented on your echo';
    case 'follow': return 'You have a new follower';
    case 'repost': return 'Your echo was re-echoed';
    case 'mention': return 'You were mentioned in an echo';
    case 'dm': return 'You have a new message';
    default: return '';
  }
}
