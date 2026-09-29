// fetch() for model providers, behind a circuit breaker shared by every
// function and isolate (public.provider_breaker, 20260928150000).
//
//   closed    requests go through; a 429, 5xx or network error counts
//   open      requests are answered with a synthetic 503 + Retry-After, no call
//             is made; opened by the provider's own Retry-After, or by
//             FAILURES_TO_OPEN failures in a row (30s, then doubling, max 1h)
//   half-open once open_until passes, requests go through again; a success
//             closes the circuit, a failure re-opens it for longer
//
// The breaker must never become the outage: if its state cannot be read or
// written, the request goes through as if it were closed.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  STATE_TTL_MS,
  isTransientStatus,
  openCircuitResponse,
  retryAfterSeconds,
  type Provider,
} from './breakerPolicy.ts';

export type { Provider };

interface State {
  failures: number;
  openUntil: number; // epoch ms; 0 when closed
  readAt: number;
}

const cache = new Map<Provider, State>();
let admin: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

function toState(row: { failures?: number; open_until?: string | null } | null | undefined, now: number): State {
  return {
    failures: row?.failures ?? 0,
    openUntil: row?.open_until ? Date.parse(row.open_until) : 0,
    readAt: now,
  };
}

async function readState(provider: Provider, now: number): Promise<State> {
  const cached = cache.get(provider);
  if (cached && now - cached.readAt < STATE_TTL_MS) return cached;
  const client = db();
  if (!client) return toState(null, now);
  try {
    const { data, error } = await client.rpc('breaker_state', { p_provider: provider });
    if (error) throw error;
    const state = toState(Array.isArray(data) ? data[0] : data, now);
    cache.set(provider, state);
    return state;
  } catch (e) {
    console.warn(`[breaker] state for ${provider} unavailable; allowing:`, e instanceof Error ? e.message : e);
    return toState(null, now);
  }
}

async function record(provider: Provider, ok: boolean, retryAfter: number | null): Promise<void> {
  const client = db();
  if (!client) return;
  try {
    const { data, error } = await client.rpc('breaker_record', {
      p_provider: provider,
      p_ok: ok,
      p_retry_after: retryAfter,
    });
    if (error) throw error;
    cache.set(provider, toState(Array.isArray(data) ? data[0] : data, Date.now()));
  } catch (e) {
    console.warn(`[breaker] could not record ${provider}:`, e instanceof Error ? e.message : e);
  }
}

export async function guardedFetch(provider: Provider, input: string | URL, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const state = await readState(provider, now);
  if (state.openUntil > now) return openCircuitResponse(provider, state.openUntil, now);

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    // An abort is the caller's decision, not the provider's failure.
    if (!(init?.signal?.aborted)) await record(provider, false, null);
    throw e;
  }
  if (isTransientStatus(res.status)) {
    await record(provider, false, retryAfterSeconds(res.headers.get('retry-after'), Date.now()));
  } else if (state.failures > 0) {
    // Only a recovery is written; a healthy provider costs no writes.
    await record(provider, true, null);
  }
  return res;
}
