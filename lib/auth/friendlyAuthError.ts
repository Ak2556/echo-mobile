/**
 * Turn a Supabase auth error into something a person can act on.
 *
 * These strings were going to the user verbatim. "email rate limit exceeded"
 * is accurate, blames the wrong party and tells nobody what to do; the reader
 * assumes they typed something wrong and tries again immediately, which is the
 * one action guaranteed not to help.
 *
 * Anything unrecognised is passed through rather than replaced with a generic
 * apology — a specific unknown error is more useful than a vague known one.
 */
export function friendlyAuthError(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = message.toLowerCase();

  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many codes requested. Wait a few minutes and try again.';
  }
  if (m.includes('token has expired') || m.includes('otp_expired') || m.includes('invalid')) {
    // Single-use: a second attempt with the same code hits this even though
    // the first one worked. Say which code to use rather than implying theirs
    // was wrong.
    return 'That code has already been used or has expired. Request a new one.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Could not reach Echo. Check your connection and try again.';
  }
  if (m.includes('timed out') || m.includes('timeout')) {
    return 'That took too long. Check your connection and try again.';
  }
  if (m.includes('email address') && m.includes('invalid')) {
    return 'That email address does not look right.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'New sign-ups are paused right now.';
  }
  return message;
}
