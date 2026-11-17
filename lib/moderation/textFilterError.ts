import { ttx } from '../i18n/i18n';
import { textFilterSurface, type TextFilterSurface } from './textFilterCode';

export { TEXT_FILTER_CODE, isTextFilterError, textFilterSurface, type TextFilterSurface } from './textFilterCode';

/**
 * What the app does with a refusal from the database text filter (lib/moderation/textFilterCode.ts) is
 * turn the code into plain words. The raw message ("text_filter:comment") means nothing to a person, and
 * the old handlers showed it as is. The words do not name the term, which would teach someone how to get
 * around it.
 */
export function textFilterMessage(surface: TextFilterSurface | 'unknown'): string {
  switch (surface) {
    case 'comment':
      return ttx("This comment contains language Echo doesn't allow. Please change it and try again.");
    case 'answer':
      return ttx("Your answer contains language Echo doesn't allow. Please change it and try again.");
    case 'username':
      return ttx("That username isn't allowed. Please choose another.");
    case 'display_name':
      return ttx("That name isn't allowed. Please choose another.");
    case 'bio':
      return ttx("Your bio contains language Echo doesn't allow. Please change it.");
    default:
      return ttx("That contains language Echo doesn't allow. Please change it.");
  }
}

/** What to show for a failed write: the filter's plain-words message, else the error's own message. */
export function writeErrorMessage(error: unknown): string {
  const surface = textFilterSurface(error);
  if (surface) return textFilterMessage(surface);
  return (error as Error | null | undefined)?.message ?? '';
}
