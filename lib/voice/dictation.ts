/**
 * Adding spoken words to text the user may already have typed.
 *
 * Dictation appends, it never replaces: someone who typed half an answer and
 * then said the rest should keep both halves. One space separates them unless
 * the text already ends in whitespace, and the result is capped at `max` so a
 * long ramble cannot push the answer past what the server accepts.
 */
export function joinDictation(base: string, spoken: string, max: number): string {
  const words = spoken.trim();
  if (!words) return base.slice(0, max);
  const joined = base.length === 0 || /\s$/.test(base) ? base + words : `${base} ${words}`;
  return joined.slice(0, max);
}
