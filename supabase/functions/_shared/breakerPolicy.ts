// Circuit-breaker rules, kept pure so vitest can check them.
//
// A provider that is rate-limiting or failing is asked again by every request
// until it recovers, and on a free-tier quota each of those requests fails
// slowly and burns latency for nothing. The breaker remembers the failure
// (across isolates, in Postgres) and answers for the provider while it is
// open, so callers fall back or fail fast.

export type Provider = 'gemini' | 'openrouter';

/** Consecutive failures that open the circuit when the provider gave no Retry-After. */
export const FAILURES_TO_OPEN = 3;

/** How long a cached view of the circuit is trusted before asking Postgres again. */
export const STATE_TTL_MS = 5_000;

/** The longest the circuit stays open on one decision. */
export const MAX_OPEN_SECONDS = 3600;

/** A response the circuit should count against the provider. */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Retry-After as seconds (delta form or HTTP date), or null. */
export function retryAfterSeconds(header: string | null, now: number): number | null {
  if (!header) return null;
  const n = Number(header);
  if (Number.isFinite(n)) return n > 0 ? Math.min(Math.ceil(n), MAX_OPEN_SECONDS) : null;
  const at = Date.parse(header);
  if (!Number.isFinite(at)) return null;
  const s = Math.ceil((at - now) / 1000);
  return s > 0 ? Math.min(s, MAX_OPEN_SECONDS) : null;
}

/**
 * What a caller sees while the circuit is open: the same shape as a provider
 * 503, so every existing error path (fallback to the next provider, "leave the
 * post pending", "voice unavailable") handles it without a special case.
 */
export function openCircuitResponse(provider: Provider, openUntil: number, now: number): Response {
  const wait = Math.max(1, Math.ceil((openUntil - now) / 1000));
  return new Response(
    JSON.stringify({ error: { message: `${provider} circuit open; retry in ${wait}s`, code: 'circuit_open' } }),
    { status: 503, headers: { 'content-type': 'application/json', 'retry-after': String(wait) } },
  );
}
