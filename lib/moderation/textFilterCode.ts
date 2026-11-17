/**
 * Recognising a text-filter refusal. No wording and no imports: the offline outbox needs only this, and
 * should not depend on the translations (lib/moderation/textFilterError.ts adds the words).
 *
 * The filter lives in the database (supabase/migrations/20261117130000_ugc_text_filter.sql). When it
 * refuses a write it raises SQLSTATE EC001 with the message `text_filter:<surface>`. The word list never
 * reaches the device, so there is one list and nothing to keep in step.
 */
export const TEXT_FILTER_CODE = 'EC001';

export const TEXT_FILTER_SURFACES = ['comment', 'answer', 'username', 'display_name', 'bio', 'mood', 'pronouns'] as const;
export type TextFilterSurface = (typeof TEXT_FILTER_SURFACES)[number];

/** The surface that was refused, 'unknown' for a filter error we have no wording for, or null when this is not a filter error. */
export function textFilterSurface(error: unknown): TextFilterSurface | 'unknown' | null {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  if (!e || e.code !== TEXT_FILTER_CODE) return null;
  const surface = /^text_filter:([a-z_]+)/.exec(typeof e.message === 'string' ? e.message : '')?.[1];
  return (TEXT_FILTER_SURFACES as readonly string[]).includes(surface ?? '') ? (surface as TextFilterSurface) : 'unknown';
}

export function isTextFilterError(error: unknown): boolean {
  return textFilterSurface(error) !== null;
}
