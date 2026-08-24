// POST /functions/v1/livekit-token
// Body: { callId: string }
// Auth: Bearer <supabase jwt>
// Returns: { token: string, wsUrl: string }
//
// Verifies the requesting user is caller or callee on the calls row,
// then mints a LiveKit access token signed with the server-side API secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
const LIVEKIT_WS_URL = 'wss://echo-oiu6q304.livekit.cloud';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Authenticate the requesting user via their Supabase JWT
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return new Response('Unauthorized', { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  let body: { callId: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  if (!body.callId) return new Response('callId required', { status: 400 });

  // Fetch the call row — RLS is bypassed by service role so we check manually
  const { data: call, error: callError } = await supabase
    .from('calls')
    .select('id, caller_id, callee_id, room_name, status')
    .eq('id', body.callId)
    .maybeSingle();

  if (callError || !call) return new Response('Call not found', { status: 404 });

  if (call.caller_id !== user.id && call.callee_id !== user.id) {
    return new Response('Forbidden', { status: 403 });
  }

  if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
    return new Response('Call is no longer active', { status: 409 });
  }

  // Mint a LiveKit JWT for this participant
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: user.id,
    ttl: '1h',
  });
  at.addGrant({
    roomJoin: true,
    room: call.room_name,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  return new Response(
    JSON.stringify({ token, wsUrl: LIVEKIT_WS_URL }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
});
