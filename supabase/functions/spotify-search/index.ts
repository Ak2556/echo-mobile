// POST /functions/v1/spotify-search
// Body: { query: string }
// Auth: Bearer <supabase jwt>
// Returns: SpotifyTrack[]
//
// Why this function exists: the search used to run in the app, which meant the
// Spotify client secret had to be an EXPO_PUBLIC_ variable to reach the client
// bundle. Expo inlines those at build time, so the secret shipped inside every
// iOS, Android and web build — recoverable with `unzip` and `strings`. Spotify's
// client-credentials grant is server-side by design; this is where it belongs.
//
// The client no longer sees the credentials at all. It sends a query and gets
// back the same shape it always did.
//
// Abuse protection here is authentication, and nothing more: any signed-in user
// can search. It deliberately does NOT use _shared/rateLimit.ts, because that
// limiter spends the caller's hourly AI budget, and a music search is not an AI
// request — charging it there would make the chat quota disappear for reasons a
// user could never work out.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

/** Long enough to be a real search, short enough not to be a payload. */
const MAX_QUERY_LENGTH = 200;
const MAX_RESULTS = 20;

// Cached across invocations on a warm instance. Spotify tokens last an hour,
// so this saves a round trip on most requests; a cold instance just re-fetches.
let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const credentials = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    // The body can echo the credentials back; log the status only.
    throw new Error(`Spotify auth failed: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  // Refresh a minute early so a request in flight cannot expire mid-call.
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken!;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.error('[spotify-search] SPOTIFY_CLIENT_ID/SECRET not set on the function');
    return json({ error: 'Music search is unavailable' }, 503);
  }

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Unauthorized' }, 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return json([]);
  if (query.length > MAX_QUERY_LENGTH) return json({ error: 'Query too long' }, 400);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error('[spotify-search]', e instanceof Error ? e.message : String(e));
    return json({ error: 'Music search is unavailable' }, 502);
  }

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${MAX_RESULTS}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (response.status === 401) {
    // The cached token was rejected — drop it so the next call re-mints.
    accessToken = null;
    tokenExpiresAt = 0;
    return json({ error: 'Music search is unavailable' }, 502);
  }

  if (!response.ok) {
    console.error(`[spotify-search] search failed: ${response.status}`);
    return json({ error: 'Music search is unavailable' }, 502);
  }

  const data = await response.json();
  const tracks = (data.tracks?.items ?? []).map((track: Record<string, any>) => ({
    id: track.id,
    title: track.name,
    artist: (track.artists ?? []).map((a: { name: string }) => a.name).join(', '),
    url: track.preview_url || track.external_urls?.spotify || '',
    coverArt: track.album?.images?.[0]?.url || '',
  }));

  return json(tracks);
});
