import { classifyError } from '../../components/common/ErrorState';
import { isDuplicateError } from '../core/mutationErrors';
import { ttx } from '../i18n/i18n';
import { textFilterMessage, textFilterSurface } from '../moderation/textFilterError';

/**
 * What the signup wizard does when its final profile save fails.
 *
 * It used to show error.message as is. On 2026-11-19 a tester's phone showed
 * "permission denied for table profiles": a missing column grant had stopped
 * every signup since 2026-09-30, and the only trace was that toast on the
 * people it failed for. A database message means nothing to them and nothing
 * reached monitoring. Now the person gets plain words and a next step, and any
 * failure that is not theirs to fix is reported.
 */
export interface SignupSaveOutcome {
  message: string;
  /** The wizard step that holds the text to change, or null to stay put. */
  goTo: 'name' | 'bio' | null;
  /** The username was taken, so the field is emptied. */
  clearUsername: boolean;
  /** Send to monitoring: the failure is ours, not something the person typed. */
  report: boolean;
}

export function signupSaveOutcome(error: unknown): SignupSaveOutcome {
  const filtered = textFilterSurface(error);
  if (filtered) {
    const goTo = filtered === 'bio' ? 'bio' : filtered === 'username' || filtered === 'display_name' ? 'name' : null;
    return { message: textFilterMessage(filtered), goTo, clearUsername: false, report: goTo === null };
  }
  if (isDuplicateError(error) || /unique|duplicate/i.test((error as { message?: string } | null)?.message ?? '')) {
    return { message: ttx('That username is taken. Please choose another.'), goTo: 'name', clearUsername: true, report: false };
  }
  if (classifyError(error) === 'offline') {
    return { message: ttx("You're offline. Connect, then tap Continue again."), goTo: null, clearUsername: false, report: false };
  }
  return {
    message: ttx("We couldn't finish setting up your profile. Tap Continue to try again."),
    goTo: null,
    clearUsername: false,
    report: true,
  };
}
