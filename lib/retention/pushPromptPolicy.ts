/**
 * When to offer the push pre-prompt.
 *
 * The OS dialog can be shown once per install; a "Don't allow" there is final.
 * The in-app pre-prompt in front of it is what we are free to repeat, so this
 * decides how often. Three offers a week apart, then never again — declining
 * the sheet is an answer, and asking forever is the fastest route to an
 * uninstall.
 */

export interface PushOfferHistory {
  /** How many times the pre-prompt has been shown on this install. */
  count: number;
  /** Epoch ms of the last showing, or 0 if never shown. */
  lastAt: number;
}

export const PUSH_OFFER_MAX = 3;
export const PUSH_OFFER_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldOfferPush(
  status: 'granted' | 'denied' | 'undetermined' | string,
  history: PushOfferHistory,
  now: number,
): boolean {
  // Granted needs nothing; denied can only be undone in system settings.
  if (status !== 'undetermined') return false;
  if (history.count <= 0) return true;
  if (history.count >= PUSH_OFFER_MAX) return false;
  return now - history.lastAt >= PUSH_OFFER_GAP_MS;
}

export function recordPushOffer(history: PushOfferHistory, now: number): PushOfferHistory {
  return { count: Math.max(0, history.count) + 1, lastAt: now };
}
