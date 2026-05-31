import { supabase } from './supabase';

export type EditorialAction = 'clarify' | 'shorten' | 'insight' | 'hook' | 'privacy';

/** Abandon a rewrite that hasn't returned in this long (ms). */
const CLIENT_TIMEOUT_MS = 25_000;

/**
 * Best-effort extraction of the server's `{ error }` message from a
 * supabase-js FunctionsHttpError. The readable body lives on `error.context`
 * (a Response), not on `error.message`.
 */
async function readFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* not JSON — fall through */
    }
  }
  return (error as Error)?.message || 'Rewrite failed';
}

/**
 * Deterministic redaction layer applied on top of the model output for the
 * "privacy" action. The model handles names/context; this guarantees obvious
 * PII patterns never slip through even if the model misses them.
 */
export function redactObviousPii(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '[redacted email]')
    // Phone numbers: 10+ digits, optionally grouped with spaces/dashes/parens.
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, (m) =>
      m.replace(/\D/g, '').length >= 10 ? '[redacted number]' : m,
    );
}

/**
 * Calls the `editorial-rewrite` edge function and returns the rewritten text.
 * Throws on failure (with the server's message when available) so the caller
 * can surface the error in UI.
 */
export async function rewriteEditorial(
  action: EditorialAction,
  text: string,
  prompt: string,
): Promise<string> {
  const invocation = supabase.functions.invoke<{ text?: string; error?: string }>(
    'editorial-rewrite',
    { body: { action, text, prompt } },
  );

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('The rewrite timed out. Please try again.')), CLIENT_TIMEOUT_MS),
  );

  const { data, error } = await Promise.race([invocation, timeout]);
  if (error) throw new Error(await readFunctionError(error));
  if (!data?.text) throw new Error(data?.error || 'Empty response from rewrite');

  return action === 'privacy' ? redactObviousPii(data.text) : data.text;
}
