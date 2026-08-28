// A booking request from someone who does not have an Echo account.
//
// POST /functions/v1/learn-guest-booking
// Body: { slug, name, email?, note?, slotId?, scheduledFor? }
//
// Guests have no JWT, so nothing about this request can be trusted: the tutor
// is resolved from the public slug rather than taken from the body, and the
// guest_token — the guest's only credential for their own booking — is minted
// here rather than accepted from the client, because a token the caller chooses
// is a token anyone can guess.
//
// Written under service role for that reason. There is deliberately no anon
// INSERT policy on learn_bookings; RLS denies by default and this is the single
// door in.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/**
 * How many pending guest requests one tutor may accumulate in an hour.
 *
 * The page is public and unauthenticated, so this is the only thing between a
 * tutor and an inbox full of junk. It caps per tutor rather than per IP because
 * an IP is trivially rotated and the damage being prevented is to the tutor.
 */
const MAX_PENDING_PER_HOUR = 20;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: {
    slug?: string; name?: string; email?: string;
    note?: string; slotId?: string; scheduledFor?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const slug = (body.slug ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim().slice(0, 80);
  if (!slug || !name) return json({ error: 'A name and a valid page are required' }, 400);

  const email = (body.email ?? '').trim().slice(0, 200);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'That email does not look right' }, 400);
  }

  // The tutor comes from the slug, never from the request body.
  const { data: tutor, error: tutorError } = await supabase
    .from('learn_tutors')
    .select('user_id')
    .eq('public_slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (tutorError) return json({ error: 'Lookup failed' }, 502);
  if (!tutor) return json({ error: 'No such booking page' }, 404);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('learn_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', tutor.user_id)
    .eq('status', 'requested')
    .is('learner_id', null)
    .gte('created_at', hourAgo);

  if ((count ?? 0) >= MAX_PENDING_PER_HOUR) {
    return json({ error: 'This page is not taking requests right now. Try again later.' }, 429);
  }

  // 32 bytes of randomness, hex. This is the guest's only credential.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const guestToken = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

  const { error: insertError } = await supabase.from('learn_bookings').insert({
    tutor_id: tutor.user_id,
    guest_name: name,
    guest_email: email || null,
    guest_token: guestToken,
    slot_id: body.slotId ?? null,
    scheduled_for: body.scheduledFor ?? null,
    prep_note: (body.note ?? '').trim().slice(0, 1000) || null,
  });

  if (insertError) {
    console.error('[learn-guest-booking] insert failed:', insertError.message);
    return json({ error: 'Could not send that request' }, 500);
  }

  return json({ ok: true, guestToken });
});
