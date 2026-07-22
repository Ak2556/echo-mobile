/**
 * Small resilience helpers shared by the write layer and the offline outbox.
 * Generalizes the ad-hoc 3×/2-4-6s backoff that lived inside triggerEmbedEcho.
 */

export interface RetryOptions {
  /** Max retry attempts after the first try. Default 3. */
  retries?: number;
  /** Base delay in ms; grows exponentially (base, 2×base, 4×base…). Default 500. */
  baseMs?: number;
  /** Cap on a single delay. Default 8000. */
  maxDelayMs?: number;
  /** Return false to stop retrying a given error early (e.g. permanent 4xx). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseMs = 500, maxDelayMs = 8000, shouldRetry } = opts;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || (shouldRetry && !shouldRetry(err, attempt))) throw err;
      await wait(Math.min(baseMs * 2 ** (attempt - 1), maxDelayMs));
    }
  }
}

/**
 * Reject if `promise` doesn't settle within `ms`, so a hung request can't block
 * a write forever. Note: the underlying request isn't cancelled (Supabase calls
 * don't uniformly accept an AbortSignal) — the caller just stops waiting.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
