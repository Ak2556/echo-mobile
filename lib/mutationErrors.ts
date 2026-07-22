import { classifyError } from '../components/common/ErrorState';

/**
 * Classifies write errors and turns raw Supabase/PostgREST/network failures
 * into short, human messages. Shared by the global mutation handler, the write
 * layer, and the offline outbox.
 */

type MaybeErr = { message?: string; code?: string; status?: number; details?: string } | null | undefined;

/**
 * Is this error worth retrying automatically? Network / timeout / 5xx are
 * transient; 4xx, RLS (42501) and integrity-constraint (23xxx) violations are
 * permanent and must NOT be hammered.
 */
export function isTransientError(err: unknown): boolean {
  const kind = classifyError(err); // 'offline' | 'timeout' | 'server' | 'unknown'
  if (kind === 'offline' || kind === 'timeout' || kind === 'server') return true;

  const e = err as MaybeErr;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (status !== undefined) {
    if (status >= 500) return true;
    if (status >= 400) return false; // client error → permanent
  }

  const code = (e?.code ?? '').toString();
  if (/^23/.test(code)) return false;   // integrity constraint violation
  if (code === '42501') return false;   // RLS: insufficient privilege

  // React Native fetch failures usually carry no status.
  const msg = (e?.message ?? '').toLowerCase();
  if (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('timed out')) {
    return true;
  }
  return false; // default: treat unknown as permanent (don't retry blindly)
}

/** True for a duplicate/unique-conflict — safe to treat an insert as success. */
export function isDuplicateError(err: unknown): boolean {
  const e = err as MaybeErr;
  const code = (e?.code ?? '').toString();
  if (code === '23505') return true; // unique_violation
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('already exists');
}

/** A short, honest message to show when a write fails. */
export function friendlyWriteError(err: unknown): string {
  const kind = classifyError(err);
  if (kind === 'offline') return 'You’re offline — we’ll sync this when you’re back.';
  if (kind === 'timeout') return 'That took too long. Please try again.';
  if (kind === 'server') return 'Echo is having a moment. Please try again.';

  const e = err as MaybeErr;
  if (e?.status === 401 || e?.status === 403 || e?.code === '42501') return 'You don’t have permission to do that.';
  if (e?.status === 409 || isDuplicateError(err)) return 'That was already saved.';
  return 'Couldn’t save. Please try again.';
}
