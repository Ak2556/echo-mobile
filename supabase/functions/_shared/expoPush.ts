// Send one payload to every device a set of users is signed in on, prune the
// tokens Expo says are gone, and report what could not be delivered.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { EXPO_MAX_PER_REQUEST, chunk, classifyTickets, deviceTokens, type ExpoTicket, type TicketOutcome } from './expoTickets.ts';

const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';

/** user id -> every token that user can be reached on. */
// deno-lint-ignore no-explicit-any
export async function tokensByUser(db: SupabaseClient<any, any, any>, userIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const [{ data: rows, error }, { data: profiles, error: legacyError }] = await Promise.all([
    db.from('push_tokens').select('user_id, token').in('user_id', userIds),
    db.from('profiles').select('id, push_token').in('id', userIds),
  ]);
  if (error) throw error;
  if (legacyError) throw legacyError;
  const byUser = new Map<string, { token: string | null }[]>();
  for (const r of (rows ?? []) as { user_id: string; token: string }[]) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), { token: r.token }]);
  }
  for (const p of (profiles ?? []) as { id: string; push_token: string | null }[]) {
    const tokens = deviceTokens(byUser.get(p.id) ?? [], p.push_token);
    if (tokens.length) out.set(p.id, tokens);
  }
  return out;
}

/**
 * POST the messages to Expo in chunks and classify every ticket. A chunk the
 * request itself failed for is reported as fatal for each of its tokens, so
 * the caller sees one outcome per message whatever went wrong.
 */
export async function sendToExpo<M extends { to: string }>(messages: M[]): Promise<TicketOutcome> {
  const total: TicketOutcome = { accepted: [], dead: [], fatal: [] };
  for (const part of chunk(messages, EXPO_MAX_PER_REQUEST)) {
    const tokens = part.map((m) => m.to);
    let tickets: ExpoTicket[] = [];
    try {
      const r = await fetch(EXPO_SEND, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(part),
      });
      const j = await r.json().catch(() => ({}));
      tickets = (j as { data?: ExpoTicket[] }).data ?? [];
      if (!r.ok && tickets.length === 0) {
        tokens.forEach((token) => total.fatal.push({ token, error: `HTTP ${r.status}` }));
        continue;
      }
    } catch (e) {
      tokens.forEach((token) => total.fatal.push({ token, error: e instanceof Error ? e.message : String(e) }));
      continue;
    }
    const o = classifyTickets(tokens, tickets);
    total.accepted.push(...o.accepted);
    total.dead.push(...o.dead);
    total.fatal.push(...o.fatal);
  }
  return total;
}

/**
 * Forget tokens Expo reported as unregistered, in both stores. Housekeeping:
 * a failure here is logged, never allowed to fail the send.
 */
// deno-lint-ignore no-explicit-any
export async function pruneDeadTokens(db: SupabaseClient<any, any, any>, dead: string[]): Promise<void> {
  if (dead.length === 0) return;
  try {
    await Promise.all([
      db.from('push_tokens').delete().in('token', dead),
      db.from('profiles').update({ push_token: null }).in('push_token', dead),
    ]);
  } catch (e) {
    console.error('[expoPush] token prune failed:', e);
  }
}
