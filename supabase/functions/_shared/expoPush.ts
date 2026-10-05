// Send one payload to every device a set of users is signed in on, prune the
// tokens Expo says are gone, and report what could not be delivered.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { EXPO_MAX_PER_REQUEST, chunk, classifyTickets, deviceTokens, type ExpoTicket, type TicketOutcome } from './expoTickets.ts';

const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';

/**
 * iOS devices are skipped until Expo holds APNs credentials for the app (see
 * deviceTokens). Set the IOS_PUSH_ENABLED secret to "true" the day the first iOS
 * build ships, or iOS users will silently receive nothing.
 */
const skipIos = () => Deno.env.get('IOS_PUSH_ENABLED') !== 'true';

/** user id -> every token that user can be reached on. */
// deno-lint-ignore no-explicit-any
export async function tokensByUser(db: SupabaseClient<any, any, any>, userIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const [{ data: rows, error }, { data: profiles, error: legacyError }] = await Promise.all([
    db.from('push_tokens').select('user_id, token, platform').in('user_id', userIds),
    db.from('profiles').select('id, push_token').in('id', userIds),
  ]);
  if (error) throw error;
  if (legacyError) throw legacyError;
  const byUser = new Map<string, { token: string | null; platform: string | null }[]>();
  for (const r of (rows ?? []) as { user_id: string; token: string; platform: string | null }[]) {
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), { token: r.token, platform: r.platform }]);
  }
  // Who owns each legacy token according to push_tokens (one row per token). A
  // legacy token that belongs to a different account is a stale copy.
  const legacyTokens = [...new Set((profiles ?? []).map((p: { push_token: string | null }) => p.push_token).filter((t: string | null): t is string => !!t))];
  const owners = new Map<string, string>();
  if (legacyTokens.length) {
    const { data: owned, error: ownedError } = await db.from('push_tokens').select('token, user_id').in('token', legacyTokens);
    if (ownedError) throw ownedError;
    for (const r of (owned ?? []) as { token: string; user_id: string }[]) owners.set(r.token, r.user_id);
  }
  for (const p of (profiles ?? []) as { id: string; push_token: string | null }[]) {
    const owner = p.push_token ? owners.get(p.push_token) : undefined;
    const tokens = deviceTokens(byUser.get(p.id) ?? [], p.push_token, {
      skipIos: skipIos(),
      legacyOwnedByOther: !!owner && owner !== p.id,
    });
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
