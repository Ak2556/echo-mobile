import { TERMS_VERSION } from '../../constants/legal/termsOfService';
import { PRIVACY_VERSION } from '../../constants/legal/privacyPolicy';

/**
 * Which versions of the Terms of Service and the Privacy Policy someone must have agreed to.
 *
 * The agreement gate (components/legal/TermsGate.tsx) asks signed-in people who have no record for
 * these versions, and asks again when either number changes. Bumping TERMS_VERSION or PRIVACY_VERSION
 * in constants/legal is therefore all it takes to collect a fresh agreement.
 */
export const CURRENT_LEGAL = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION } as const;

export type LegalVersions = { terms: string; privacy: string };
export type LegalRow = { kind: string; version: string };

/** True when the rows show agreement to both documents at the current versions. */
export function hasAcceptedCurrent(rows: readonly LegalRow[], current: LegalVersions = CURRENT_LEGAL): boolean {
  const has = (kind: string, version: string) => rows.some((r) => r.kind === kind && r.version === version);
  return has('terms', current.terms) && has('privacy', current.privacy);
}

/**
 * What the device remembers once the server has confirmed an agreement, so the next launch does not
 * wait on the network. Tied to the person and to both versions: a different account, or a new version
 * of either document, never matches and sends the check back to the server.
 */
export function acceptedToken(userId: string, current: LegalVersions = CURRENT_LEGAL): string {
  return `${userId}|${current.terms}|${current.privacy}`;
}

export const ACCEPTED_STORAGE_KEY = 'legal:accepted';
